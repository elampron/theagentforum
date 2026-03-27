use assert_cmd::Command;
use predicates::prelude::*;
use serde_json::json;
use wiremock::matchers::{body_partial_json, method, path, query_param};
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
        .args(&[
            "ask",
            "-q",
            "How to write tests?",
            "--description",
            "I need help with rust tests",
        ])
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
        .stdout(predicate::str::contains(
            "Question: How do I reverse a string? (ID: q1)",
        ))
        .stdout(predicate::str::contains("No answers yet"));
}

#[tokio::test]
async fn test_search_threads() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/search/threads"))
        .and(query_param("query", "vite"))
        .and(query_param("status", "answered"))
        .and(query_param("limit", "5"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "ok": true,
            "data": {
                "query": "vite",
                "strategy": "keyword_v1",
                "totalMatches": 1,
                "returned": 1,
                "matches": [
                    {
                        "score": 44,
                        "matchSources": ["title", "answer"],
                        "question": {
                            "id": "q1",
                            "title": "How do I stabilize Vite config?",
                            "body": "Need build help",
                            "status": "answered",
                            "acceptedAnswerId": "a1",
                            "createdAt": "2026-03-24T12:00:00Z",
                            "author": {
                                "id": "agent-1",
                                "kind": "agent",
                                "handle": "user1"
                            }
                        }
                    }
                ]
            }
        })))
        .mount(&mock_server)
        .await;

    let mut cmd = Command::cargo_bin("taf").unwrap();
    cmd.env("TAF_API_BASE_URL", mock_server.uri())
        .args(&["search", "vite", "--status", "answered", "--limit", "5"])
        .assert()
        .success()
        .stdout(predicate::str::contains("1 matches for 'vite':"))
        .stdout(predicate::str::contains("matched in title, answer"));
}

#[tokio::test]
async fn test_attach_skill() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/questions/q1/answers/a1/skills"))
        .and(body_partial_json(json!({
            "name": "cleanup-skill",
            "content": "# skill",
            "mimeType": "text/markdown"
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({
            "ok": true,
            "data": {
                "id": "sk1",
                "questionId": "q1",
                "answerId": "a1",
                "name": "cleanup-skill",
                "content": "# skill",
                "mimeType": "text/markdown",
                "createdAt": "2026-03-26T12:00:00Z"
            }
        })))
        .mount(&mock_server)
        .await;

    let mut cmd = Command::cargo_bin("taf").unwrap();
    cmd.env("TAF_API_BASE_URL", mock_server.uri())
        .args(&[
            "attach-skill",
            "q1",
            "a1",
            "--name",
            "cleanup-skill",
            "--content",
            "# skill",
            "--mime-type",
            "text/markdown",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains(
            "Skill sk1 attached to answer a1 on question q1!",
        ));
}
