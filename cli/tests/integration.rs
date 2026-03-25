use assert_cmd::Command;
use predicates::prelude::*;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn test_health_check() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "ok": true,
            "data": {
                "service": "api",
                "status": "ok"
            }
        })))
        .mount(&mock_server)
        .await;

    let mut cmd = Command::cargo_bin("taf").unwrap();
    cmd.env("TAF_API_BASE_URL", mock_server.uri())
        .arg("health")
        .assert()
        .success()
        .stdout(predicate::str::contains("API is healthy"));
}

#[tokio::test]
async fn test_health_check_json() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "ok": true,
            "data": {
                "service": "api",
                "status": "ok"
            }
        })))
        .mount(&mock_server)
        .await;

    let mut cmd = Command::cargo_bin("taf").unwrap();
    cmd.env("TAF_API_BASE_URL", mock_server.uri())
        .arg("--json")
        .arg("health")
        .assert()
        .success()
        .stdout(predicate::str::contains("\"service\": \"api\""));
}

#[tokio::test]
async fn test_ask_question() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/questions"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({
            "ok": true,
            "data": {
                "id": "q123",
                "title": "How to write tests?",
                "body": "I need help with rust tests",
                "status": "open",
                "createdAt": "2026-03-24T12:00:00Z",
                "author": {
                    "id": "agent-1",
                    "kind": "agent",
                    "handle": "taf-cli"
                }
            }
        })))
        .mount(&mock_server)
        .await;

    let mut cmd = Command::cargo_bin("taf").unwrap();
    cmd.env("TAF_API_BASE_URL", mock_server.uri())
        .args(&["ask", "-q", "How to write tests?", "--description", "I need help with rust tests"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Question created! ID: q123"));
}

#[tokio::test]
async fn test_list_questions() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/questions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "ok": true,
            "data": [
                {
                    "id": "q1",
                    "title": "First question",
                    "body": "body1",
                    "status": "open",
                    "createdAt": "2026-03-24T12:00:00Z",
                    "author": {
                        "id": "agent-1",
                        "kind": "agent",
                        "handle": "user1"
                    }
                }
            ]
        })))
        .mount(&mock_server)
        .await;

    let mut cmd = Command::cargo_bin("taf").unwrap();
    cmd.env("TAF_API_BASE_URL", mock_server.uri())
        .arg("list")
        .assert()
        .success()
        .stdout(predicate::str::contains("First question (by user1) - q1"));
}

#[tokio::test]
async fn test_view_question() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/questions/q1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "ok": true,
            "data": {
                "question": {
                    "id": "q1",
                    "title": "How do I reverse a string?",
                    "body": "Need to reverse it",
                    "status": "open",
                    "createdAt": "2026-03-24T12:00:00Z",
                    "author": {
                        "id": "a1",
                        "kind": "agent",
                        "handle": "test-agent"
                    }
                },
                "answers": []
            }
        })))
        .mount(&mock_server)
        .await;

    let mut cmd = Command::cargo_bin("taf").unwrap();
    cmd.env("TAF_API_BASE_URL", mock_server.uri())
        .args(&["question", "q1"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Question: How do I reverse a string? (ID: q1)"))
        .stdout(predicate::str::contains("No answers yet"));
}
