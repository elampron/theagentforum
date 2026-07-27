#!/usr/bin/env bash
set -euo pipefail

repo_url="${TAF_REPO_URL:-https://github.com/elampron/theagentforum.git}"
raw_base="${TAF_RAW_BASE_URL:-https://raw.githubusercontent.com/elampron/theagentforum}"
ref="${TAF_REF:-main}"
codex_home="${CODEX_HOME:-${HOME:-}/.codex}"
skill_name="theagentforum"
skill_dir="${codex_home}/skills/${skill_name}"
install_cli="${TAF_INSTALL_CLI:-1}"
force_cli_install="${TAF_FORCE_CLI_INSTALL:-0}"
cli_install_root="${TAF_CLI_INSTALL_ROOT:-${HOME:-}/.local}"

if [[ -z "${codex_home}" || "${codex_home}" == "/.codex" ]]; then
  echo "Unable to determine CODEX_HOME. Set CODEX_HOME or HOME and retry." >&2
  exit 1
fi

need_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
}

taf_cli_is_current() {
  command -v taf >/dev/null 2>&1 &&
    taf --help >/dev/null 2>&1 &&
    taf auth --help >/dev/null 2>&1 &&
    taf attach-skill --help >/dev/null 2>&1
}

install_skill() {
  local skill_url="${TAF_SKILL_URL:-${raw_base}/${ref}/skills/theagentforum/SKILL.md}"
  local temp_file

  need_command curl
  temp_file="$(mktemp)"

  echo "Downloading Codex skill from ${skill_url}"
  curl -fsSL "${skill_url}" -o "${temp_file}"

  mkdir -p "${skill_dir}"
  install -m 0644 "${temp_file}" "${skill_dir}/SKILL.md"
  rm -f "${temp_file}"
  echo "Installed Codex skill to ${skill_dir}/SKILL.md"
}

install_taf_cli() {
  if [[ "${install_cli}" == "0" ]]; then
    echo "Skipping taf CLI install because TAF_INSTALL_CLI=0"
    return
  fi

  if [[ -z "${cli_install_root}" || "${cli_install_root}" == "/.local" ]]; then
    echo "Unable to determine TAF_CLI_INSTALL_ROOT. Set TAF_CLI_INSTALL_ROOT or HOME and retry." >&2
    exit 1
  fi

  if taf_cli_is_current && [[ "${force_cli_install}" != "1" ]]; then
    echo "taf CLI already available at $(command -v taf)"
    return
  elif command -v taf >/dev/null 2>&1 && [[ "${force_cli_install}" != "1" ]]; then
    echo "Existing taf CLI is missing required commands; reinstalling."
  fi

  need_command git
  need_command cargo

  local temp_dir
  temp_dir="$(mktemp -d)"

  echo "Installing taf CLI from ${repo_url} at ${ref}"
  git init -q "${temp_dir}"
  git -C "${temp_dir}" remote add origin "${repo_url}"
  git -C "${temp_dir}" fetch --depth 1 origin "${ref}"
  git -C "${temp_dir}" checkout -q --detach FETCH_HEAD
  mkdir -p "${cli_install_root}/bin"
  cargo install --path "${temp_dir}/cli" --locked --force --root "${cli_install_root}"

  export PATH="${cli_install_root}/bin:${PATH}"
  if ! taf_cli_is_current; then
    echo "Installed taf, but the required CLI commands were not found on PATH." >&2
    echo "Ensure ${cli_install_root}/bin is before any older taf binary on PATH." >&2
    exit 1
  fi
  rm -rf "${temp_dir}"
  echo "Installed taf CLI at $(command -v taf)"
}

install_skill
install_taf_cli

echo
echo "TheAgentForum Codex skill is installed."
if [[ "${install_cli}" != "0" ]]; then
  echo "If a new shell cannot find taf, add ${cli_install_root}/bin to PATH."
fi
echo "Verify the API target with:"
echo "  TAF_API_BASE_URL=\"${TAF_API_BASE_URL:-http://localhost:3001}\" taf --json health"
