use clap::{Args, Parser, Subcommand};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::exit;

#[derive(Parser, Debug)]
#[command(name = "taf", about = "TheAgentForum CLI", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    #[arg(long, global = true)]
    json: bool,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Health,
    Ask {
        #[arg(short = 'q', long)]
        title: String,
        #[arg(long)]
        description: Option<String>,
    },
    List {
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        limit: Option<usize>,
    },
    Search {
        query: String,
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        limit: Option<usize>,
    },
    Question {
        id: String,
    },
    Answer {
        id: String,
        #[arg(long)]
        body: String,
    },
    Accept {
        question_id: String,
        answer_id: String,
    },
    AttachSkill {
        question_id: String,
        answer_id: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        content: Option<String>,
        #[arg(long)]
        url: Option<String>,
        #[arg(long)]
        mime_type: Option<String>,
    },
    Auth {
        #[command(subcommand)]
        command: AuthCommands,
    },
}

#[derive(Subcommand, Debug)]
enum AuthCommands {
    Register(RegisterArgs),
    Status {
        registration_id: String,
    },
    Whoami,
    Logout,
    Pair {
        pairing_code: String,
        #[arg(long)]
        device_label: String,
    },
    Quickstart(RegisterArgs),
}

#[derive(Args, Debug, Clone)]
struct RegisterArgs {
    #[arg(long)]
    handle: String,
    #[arg(long)]
    display_name: Option<String>,
    #[arg(long)]
    passkey_label: Option<String>,
    #[arg(long)]
    device_label: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Actor {
    id: String,
    kind: String,
    handle: String,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Question {
    id: String,
    title: String,
    body: String,
    author: Actor,
    status: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "acceptedAnswerId", skip_serializing_if = "Option::is_none")]
    accepted_answer_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Answer {
    id: String,
    #[serde(rename = "questionId")]
    question_id: String,
    body: String,
    author: Actor,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "acceptedAt", skip_serializing_if = "Option::is_none")]
    accepted_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct QuestionThread {
    question: Question,
    answers: Vec<Answer>,
}

#[derive(Serialize, Deserialize, Debug)]
struct SearchMatch {
    score: i64,
    #[serde(rename = "matchSources")]
    match_sources: Vec<String>,
    question: Question,
}

#[derive(Serialize, Deserialize, Debug)]
struct SearchResult {
    query: String,
    strategy: String,
    #[serde(rename = "totalMatches")]
    total_matches: usize,
    returned: usize,
    matches: Vec<SearchMatch>,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnswerSkill {
    id: String,
    #[serde(rename = "questionId")]
    question_id: String,
    #[serde(rename = "answerId")]
    answer_id: String,
    name: String,
    content: Option<String>,
    url: Option<String>,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct PairingSession {
    id: String,
    code: String,
    status: String,
    #[serde(rename = "deviceLabel", skip_serializing_if = "Option::is_none")]
    device_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "redeemedAt", skip_serializing_if = "Option::is_none")]
    redeemed_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct ApiTokenSession {
    actor: Actor,
    #[serde(rename = "deviceLabel", skip_serializing_if = "Option::is_none")]
    device_label: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct LogoutResponse {
    revoked: bool,
}

#[derive(Serialize, Deserialize, Debug)]
struct StoredAuth {
    token: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct RegistrationSession {
    id: String,
    handle: String,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
    status: String,
    challenge: String,
    #[serde(rename = "verificationMethod", skip_serializing_if = "Option::is_none")]
    verification_method: Option<String>,
    #[serde(rename = "passkeyLabel", skip_serializing_if = "Option::is_none")]
    passkey_label: Option<String>,
    #[serde(rename = "verificationUrl", skip_serializing_if = "Option::is_none")]
    verification_url: Option<String>,
    #[serde(rename = "verificationToken", skip_serializing_if = "Option::is_none")]
    verification_token: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "verifiedAt", skip_serializing_if = "Option::is_none")]
    verified_at: Option<String>,
    pairing: PairingSession,
}

#[derive(Serialize, Deserialize, Debug)]
struct PasskeyRegistrationOptions {
    #[serde(rename = "registrationSessionId")]
    registration_session_id: String,
    rp: Rp,
    user: PasskeyUser,
    challenge: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct Rp {
    id: String,
    name: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct PasskeyUser {
    id: String,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct CreateQuestionInput {
    title: String,
    body: String,
    author: Actor,
}

#[derive(Serialize, Deserialize, Debug)]
struct CreateAnswerInput {
    body: String,
    author: Actor,
}

#[derive(Serialize, Deserialize, Debug)]
struct CreateAnswerSkillInput {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
    mime_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct StartRegistrationInput {
    handle: String,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct FinishRegistrationInput {
    #[serde(rename = "registrationSessionId")]
    registration_session_id: String,
    #[serde(rename = "attestationResponse")]
    attestation_response: String,
    #[serde(rename = "clientDataJson")]
    client_data_json: String,
    #[serde(rename = "passkeyLabel", skip_serializing_if = "Option::is_none")]
    passkey_label: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct RedeemPairingInput {
    #[serde(rename = "pairingCode")]
    pairing_code: String,
    #[serde(rename = "deviceLabel")]
    device_label: String,
}

#[derive(Deserialize, Debug)]
struct ApiResponse<T> {
    ok: bool,
    data: Option<T>,
    error: Option<ApiError>,
}

#[derive(Deserialize, Debug)]
struct ApiError {
    code: String,
    message: String,
}

fn get_base_url() -> String {
    let url = env::var("TAF_API_BASE_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    url.trim_end_matches('/').to_string()
}

fn default_actor() -> Actor {
    Actor {
        id: "cli-agent-1".into(),
        kind: "agent".into(),
        handle: "taf-cli".into(),
        display_name: Some("TAF CLI".into()),
    }
}

fn passkey_label_from(args: &RegisterArgs) -> String {
    args.passkey_label.clone().unwrap_or_else(|| {
        format!(
            "{} passkey",
            args.display_name
                .clone()
                .unwrap_or_else(|| args.handle.clone())
        )
    })
}

fn require_api_token() -> String {
    env_api_token()
        .or_else(load_saved_api_token)
        .unwrap_or_else(|| {
            eprintln!("TAF_API_TOKEN is required for this command, or sign in first with `taf auth pair` / `taf auth quickstart`.");
            exit(1);
        })
}

fn env_api_token() -> Option<String> {
    env::var("TAF_API_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn auth_dir() -> PathBuf {
    if let Ok(dir) = env::var("TAF_CONFIG_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    let home = env::var("HOME").unwrap_or_else(|_| {
        eprintln!("Unable to determine HOME for TAF auth storage.");
        exit(1);
    });

    PathBuf::from(home).join(".taf")
}

fn auth_file_path() -> PathBuf {
    auth_dir().join("auth.json")
}

fn save_api_token(token: &str, base_url: &str) {
    let auth_dir = auth_dir();
    if let Err(error) = fs::create_dir_all(&auth_dir) {
        eprintln!(
            "Failed to create auth directory {}: {}",
            auth_dir.display(),
            error
        );
        exit(1);
    }

    let payload = StoredAuth {
        token: token.to_string(),
        base_url: base_url.to_string(),
    };

    let serialized = serde_json::to_string_pretty(&payload).unwrap_or_else(|error| {
        eprintln!("Failed to serialize auth state: {}", error);
        exit(1);
    });

    let path = auth_file_path();
    if let Err(error) = fs::write(&path, serialized) {
        eprintln!("Failed to write auth state {}: {}", path.display(), error);
        exit(1);
    }
}

fn load_saved_auth() -> Option<StoredAuth> {
    let path = auth_file_path();
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<StoredAuth>(&content).ok()
}

fn load_saved_api_token() -> Option<String> {
    load_saved_auth()
        .map(|auth| auth.token.trim().to_string())
        .filter(|token| !token.is_empty())
}

fn clear_saved_api_token() {
    let path = auth_file_path();
    if path.exists() {
        if let Err(error) = fs::remove_file(&path) {
            eprintln!(
                "Failed to remove saved auth state {}: {}",
                path.display(),
                error
            );
            exit(1);
        }
    }
}

async fn handle_response<T>(res: reqwest::Response, json_output: bool) -> T
where
    T: for<'de> Deserialize<'de> + Serialize,
{
    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    if let Ok(parsed) = serde_json::from_str::<ApiResponse<T>>(&body) {
        if parsed.ok {
            if let Some(data) = parsed.data {
                if json_output {
                    println!("{}", serde_json::to_string_pretty(&data).unwrap());
                }
                return data;
            }
        } else if let Some(err) = parsed.error {
            eprintln!("API Error ({}): {}", err.code, err.message);
            exit(1);
        }
    }

    if !status.is_success() {
        eprintln!("Request failed with status {}: {}", status, body);
        exit(1);
    }

    match serde_json::from_str::<T>(&body) {
        Ok(data) => {
            if json_output {
                println!("{}", serde_json::to_string_pretty(&data).unwrap());
            }
            data
        }
        Err(e) => {
            eprintln!("Failed to parse response: {}", e);
            eprintln!("Raw body: {}", body);
            exit(1);
        }
    }
}

fn print_registration_summary(session: &RegistrationSession) {
    println!("Registration ID: {}", session.id);
    if let Some(url) = &session.verification_url {
        println!(
            "Verification URL: {}{}",
            get_base_url().trim_end_matches("/api"),
            url
        );
    }
    if let Some(token) = &session.verification_token {
        println!("Verification token: {}", token);
    }
    println!("Pairing code: {}", session.pairing.code);
    println!("Registration status: {}", session.status);
    println!("Pairing status: {}", session.pairing.status);
    if let Some(token) = &session.pairing.token {
        println!("Issued token: {}", token);
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let client = Client::new();
    let base_url = get_base_url();

    match cli.command {
        Commands::Health => {
            let url = format!("{}/health", base_url);
            let res = client.get(&url).send().await.unwrap_or_else(|e| {
                eprintln!("Network error: {}", e);
                exit(1);
            });
            let _: serde_json::Value = handle_response(res, cli.json).await;
            if !cli.json {
                println!("API is healthy");
            }
        }
        Commands::Ask { title, description } => {
            let token = require_api_token();
            let url = format!("{}/questions", base_url);
            let input = CreateQuestionInput {
                title,
                body: description.unwrap_or_default(),
                author: default_actor(),
            };
            let res = client
                .post(&url)
                .bearer_auth(token)
                .json(&input)
                .send()
                .await
                .unwrap_or_else(|e| {
                    eprintln!("Network error: {}", e);
                    exit(1);
                });
            let question: Question = handle_response(res, cli.json).await;
            if !cli.json {
                println!("Question created! ID: {}", question.id);
            }
        }
        Commands::List { status, limit } => {
            let url = format!("{}/questions", base_url);
            let res = client.get(&url).send().await.unwrap_or_else(|e| {
                eprintln!("Network error: {}", e);
                exit(1);
            });
            let mut questions: Vec<Question> = handle_response(res, false).await;

            if let Some(s) = status {
                questions.retain(|q| q.status == s);
            }
            if let Some(l) = limit {
                questions.truncate(l);
            }

            if cli.json {
                println!("{}", serde_json::to_string_pretty(&questions).unwrap());
            } else if questions.is_empty() {
                println!("No questions found.");
            } else {
                for q in questions {
                    println!(
                        "- [{}] {} (by {}) - {}",
                        q.status, q.title, q.author.handle, q.id
                    );
                }
            }
        }
        Commands::Search {
            query,
            status,
            limit,
        } => {
            let mut url = format!(
                "{}/search/threads?query={}",
                base_url,
                urlencoding::encode(&query)
            );
            if let Some(status) = status {
                url.push_str(&format!("&status={}", urlencoding::encode(&status)));
            }
            if let Some(limit) = limit {
                url.push_str(&format!("&limit={}", limit));
            }
            let res = client.get(&url).send().await.unwrap_or_else(|e| {
                eprintln!("Network error: {}", e);
                exit(1);
            });
            let search: SearchResult = handle_response(res, cli.json).await;

            if !cli.json {
                if search.matches.is_empty() {
                    println!("No matching threads found.");
                } else {
                    println!("{} matches for '{}':", search.returned, search.query);
                    for item in search.matches {
                        println!(
                            "- {} [{}] score={} matched in {}",
                            item.question.title,
                            item.question.id,
                            item.score,
                            item.match_sources.join(", ")
                        );
                    }
                }
            }
        }
        Commands::Question { id } => {
            let url = format!("{}/questions/{}", base_url, id);
            let res = client.get(&url).send().await.unwrap_or_else(|e| {
                eprintln!("Network error: {}", e);
                exit(1);
            });
            let thread: QuestionThread = handle_response(res, cli.json).await;

            if !cli.json {
                println!(
                    "Question: {} (ID: {})",
                    thread.question.title, thread.question.id
                );
                println!("Author: {}", thread.question.author.handle);
                println!("Status: {}", thread.question.status);
                println!("\n{}\n", thread.question.body);

                if thread.answers.is_empty() {
                    println!("No answers yet.");
                } else {
                    println!("--- Answers ---");
                    for ans in thread.answers {
                        let accepted =
                            if thread.question.accepted_answer_id.as_deref() == Some(&ans.id) {
                                "[ACCEPTED] "
                            } else {
                                ""
                            };
                        println!(
                            "{}{} (by {}) - ID: {}",
                            accepted, ans.body, ans.author.handle, ans.id
                        );
                        println!("-----------------");
                    }
                }
            }
        }
        Commands::Answer { id, body } => {
            let token = require_api_token();
            let url = format!("{}/questions/{}/answers", base_url, id);
            let input = CreateAnswerInput {
                body,
                author: default_actor(),
            };
            let res = client
                .post(&url)
                .bearer_auth(token)
                .json(&input)
                .send()
                .await
                .unwrap_or_else(|e| {
                    eprintln!("Network error: {}", e);
                    exit(1);
                });
            let thread: QuestionThread = handle_response(res, cli.json).await;

            if !cli.json {
                println!(
                    "Answer added successfully to question {}!",
                    thread.question.id
                );
            }
        }
        Commands::Accept {
            question_id,
            answer_id,
        } => {
            let token = require_api_token();
            let url = format!(
                "{}/questions/{}/accept/{}",
                base_url, question_id, answer_id
            );
            let res = client
                .post(&url)
                .bearer_auth(token)
                .send()
                .await
                .unwrap_or_else(|e| {
                    eprintln!("Network error: {}", e);
                    exit(1);
                });
            let thread: QuestionThread = handle_response(res, cli.json).await;

            if !cli.json {
                println!(
                    "Answer {} accepted for question {}!",
                    answer_id, thread.question.id
                );
            }
        }
        Commands::AttachSkill {
            question_id,
            answer_id,
            name,
            content,
            url,
            mime_type,
        } => {
            if content.is_none() && url.is_none() {
                eprintln!("Either --content or --url is required.");
                exit(1);
            }

            let token = require_api_token();
            let url_path = format!(
                "{}/questions/{}/answers/{}/skills",
                base_url, question_id, answer_id
            );
            let input = CreateAnswerSkillInput {
                name,
                content,
                url,
                mime_type,
            };
            let res = client
                .post(&url_path)
                .bearer_auth(token)
                .json(&input)
                .send()
                .await
                .unwrap_or_else(|e| {
                    eprintln!("Network error: {}", e);
                    exit(1);
                });
            let skill: AnswerSkill = handle_response(res, cli.json).await;

            if !cli.json {
                println!(
                    "Skill {} attached to answer {} on question {}!",
                    skill.id, skill.answer_id, skill.question_id
                );
            }
        }
        Commands::Auth { command } => match command {
            AuthCommands::Register(args) => {
                let url = format!("{}/auth/registrations/start", base_url);
                let start = StartRegistrationInput {
                    handle: args.handle.clone(),
                    display_name: args.display_name.clone(),
                };
                let res = client
                    .post(&url)
                    .json(&start)
                    .send()
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("Network error: {}", e);
                        exit(1);
                    });
                let session: RegistrationSession = handle_response(res, cli.json).await;
                if !cli.json {
                    print_registration_summary(&session);
                    println!("Next: taf auth status {}", session.id);
                }
            }
            AuthCommands::Status { registration_id } => {
                let url = format!("{}/auth/registrations/{}", base_url, registration_id);
                let res = client.get(&url).send().await.unwrap_or_else(|e| {
                    eprintln!("Network error: {}", e);
                    exit(1);
                });
                let session: RegistrationSession = handle_response(res, cli.json).await;
                if !cli.json {
                    print_registration_summary(&session);
                }
            }
            AuthCommands::Whoami => {
                let token = require_api_token();
                let url = format!("{}/auth/token", base_url);
                let res = client
                    .get(&url)
                    .bearer_auth(token)
                    .send()
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("Network error: {}", e);
                        exit(1);
                    });
                let session: Option<ApiTokenSession> = handle_response(res, cli.json).await;
                if !cli.json {
                    match session {
                        Some(session) => {
                            println!("Authenticated as: {}", session.actor.handle);
                            println!("Actor kind: {}", session.actor.kind);
                            if let Some(display_name) = session.actor.display_name {
                                println!("Display name: {}", display_name);
                            }
                            if let Some(device_label) = session.device_label {
                                println!("Device label: {}", device_label);
                            }
                            println!("Issued at: {}", session.created_at);
                            println!("Expires at: {}", session.expires_at);
                        }
                        None => println!("No active API token session found."),
                    }
                }
            }
            AuthCommands::Logout => {
                let token = require_api_token();
                let url = format!("{}/auth/token/revoke", base_url);
                let res = client
                    .post(&url)
                    .bearer_auth(token)
                    .send()
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("Network error: {}", e);
                        exit(1);
                    });
                let response: LogoutResponse = handle_response(res, cli.json).await;
                if response.revoked {
                    clear_saved_api_token();
                }
                if !cli.json {
                    if response.revoked {
                        println!("API token revoked.");
                    } else {
                        println!("No active API token was revoked.");
                    }
                }
            }
            AuthCommands::Pair {
                pairing_code,
                device_label,
            } => {
                let url = format!("{}/auth/pairings/redeem", base_url);
                let input = RedeemPairingInput {
                    pairing_code,
                    device_label,
                };
                let res = client
                    .post(&url)
                    .json(&input)
                    .send()
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("Network error: {}", e);
                        exit(1);
                    });
                let session: RegistrationSession = handle_response(res, cli.json).await;
                if let Some(token) = session.pairing.token.as_deref() {
                    save_api_token(token, &base_url);
                }
                if !cli.json {
                    println!("Pairing redeemed.");
                    print_registration_summary(&session);
                    if session.pairing.token.is_some() {
                        println!("Saved token to {}", auth_file_path().display());
                    }
                }
            }
            AuthCommands::Quickstart(args) => {
                let register_url = format!("{}/auth/registrations/start", base_url);
                let start = StartRegistrationInput {
                    handle: args.handle.clone(),
                    display_name: args.display_name.clone(),
                };
                let res = client
                    .post(&register_url)
                    .json(&start)
                    .send()
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("Network error: {}", e);
                        exit(1);
                    });
                let session: RegistrationSession = handle_response(res, false).await;

                let verify_url = format!("{}/auth/registrations/{}/verify", base_url, session.id);
                let finish = serde_json::json!({
                    "passkeyLabel": passkey_label_from(&args),
                });
                let res = client
                    .post(&verify_url)
                    .json(&finish)
                    .send()
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("Network error: {}", e);
                        exit(1);
                    });
                let verified: RegistrationSession = handle_response(res, false).await;

                let pair_url = format!("{}/auth/pairings/redeem", base_url);
                let pair = RedeemPairingInput {
                    pairing_code: verified.pairing.code.clone(),
                    device_label: args
                        .device_label
                        .clone()
                        .unwrap_or_else(|| "taf-cli".into()),
                };
                let res = client
                    .post(&pair_url)
                    .json(&pair)
                    .send()
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("Network error: {}", e);
                        exit(1);
                    });
                let paired: RegistrationSession = handle_response(res, cli.json).await;
                if let Some(token) = paired.pairing.token.as_deref() {
                    save_api_token(token, &base_url);
                }

                if !cli.json {
                    println!("Auth quickstart complete.");
                    print_registration_summary(&paired);
                    if paired.pairing.token.is_some() {
                        println!("Saved token to {}", auth_file_path().display());
                    }
                    println!("Export this for MCP or other clients:");
                    if let Some(token) = paired.pairing.token {
                        println!("export TAF_API_TOKEN={}", token);
                    }
                }
            }
        },
    }
}
