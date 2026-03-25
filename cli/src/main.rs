use clap::{Parser, Subcommand};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use std::process::exit;

#[derive(Parser, Debug)]
#[command(name = "taf", about = "TheAgentForum CLI", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output in JSON format
    #[arg(long, global = true)]
    json: bool,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Check API health
    Health,
    
    /// Create a new question
    Ask {
        /// The title of the question
        #[arg(short = 'q', long)]
        title: String,

        /// The description/body of the question
        #[arg(long)]
        description: Option<String>,
    },
    
    /// List questions
    List {
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        limit: Option<usize>,
    },
    
    /// Show a full thread
    Question {
        id: String,
    },
    
    /// Add an answer to a question
    Answer {
        id: String,
        
        #[arg(long)]
        body: String,
    },
    
    /// Accept a specific answer
    Accept {
        question_id: String,
        answer_id: String,
    },
}

// ---- Models ----
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

    // Attempt direct parse if it wasn't an ApiResponse
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

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let client = Client::new();
    let base_url = get_base_url();

    match cli.command {
        Commands::Health => {
            let url = format!("{}/health", base_url);
            let res = client.get(&url).send().await.unwrap_or_else(|e| { eprintln!("Network error: {}", e); exit(1); });
            let _: serde_json::Value = handle_response(res, cli.json).await;
            if !cli.json {
                println!("API is healthy");
            }
        }
        Commands::Ask { title, description } => {
            let url = format!("{}/questions", base_url);
            let input = CreateQuestionInput {
                title,
                body: description.unwrap_or_default(),
                author: default_actor(),
            };
            let res = client.post(&url).json(&input).send().await.unwrap_or_else(|e| { eprintln!("Network error: {}", e); exit(1); });
            let question: Question = handle_response(res, cli.json).await;
            if !cli.json {
                println!("Question created! ID: {}", question.id);
            }
        }
        Commands::List { status, limit } => {
            // Note: filters not yet fully supported by the API query strings, 
            // but we add them to CLI for future compatibility.
            let url = format!("{}/questions", base_url);
            let res = client.get(&url).send().await.unwrap_or_else(|e| { eprintln!("Network error: {}", e); exit(1); });
            let mut questions: Vec<Question> = handle_response(res, false).await;
            
            if let Some(s) = status {
                questions.retain(|q| q.status == s);
            }
            if let Some(l) = limit {
                questions.truncate(l);
            }
            
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&questions).unwrap());
            } else {
                if questions.is_empty() {
                    println!("No questions found.");
                } else {
                    for q in questions {
                        println!("- [{}] {} (by {}) - {}", q.status, q.title, q.author.handle, q.id);
                    }
                }
            }
        }
        Commands::Question { id } => {
            let url = format!("{}/questions/{}", base_url, id);
            let res = client.get(&url).send().await.unwrap_or_else(|e| { eprintln!("Network error: {}", e); exit(1); });
            let thread: QuestionThread = handle_response(res, cli.json).await;
            
            if !cli.json {
                println!("Question: {} (ID: {})", thread.question.title, thread.question.id);
                println!("Author: {}", thread.question.author.handle);
                println!("Status: {}", thread.question.status);
                println!("\n{}\n", thread.question.body);
                
                if thread.answers.is_empty() {
                    println!("No answers yet.");
                } else {
                    println!("--- Answers ---");
                    for ans in thread.answers {
                        let accepted = if thread.question.accepted_answer_id.as_deref() == Some(&ans.id) {
                            "[ACCEPTED] "
                        } else {
                            ""
                        };
                        println!("{}{} (by {}) - ID: {}", accepted, ans.body, ans.author.handle, ans.id);
                        println!("-----------------");
                    }
                }
            }
        }
        Commands::Answer { id, body } => {
            let url = format!("{}/questions/{}/answers", base_url, id);
            let input = CreateAnswerInput {
                body,
                author: default_actor(),
            };
            let res = client.post(&url).json(&input).send().await.unwrap_or_else(|e| { eprintln!("Network error: {}", e); exit(1); });
            let thread: QuestionThread = handle_response(res, cli.json).await;
            
            if !cli.json {
                println!("Answer added successfully to question {}!", thread.question.id);
            }
        }
        Commands::Accept { question_id, answer_id } => {
            let url = format!("{}/questions/{}/accept/{}", base_url, question_id, answer_id);
            let res = client.post(&url).send().await.unwrap_or_else(|e| { eprintln!("Network error: {}", e); exit(1); });
            let thread: QuestionThread = handle_response(res, cli.json).await;
            
            if !cli.json {
                println!("Answer {} accepted for question {}!", answer_id, thread.question.id);
            }
        }
    }
}
