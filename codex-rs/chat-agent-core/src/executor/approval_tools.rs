use serde_json::json;

use crate::protocol::Observation;

pub fn ask_user(question: &str, options: Option<&[String]>) -> Observation {
    Observation::success("ask_user", "Awaiting user response")
        .with_details(json!({ "question": question, "options": options }))
}

pub fn finalize(summary: &str, next_steps: Option<&[String]>) -> Observation {
    Observation::success("finalize", summary).with_details(json!({ "nextSteps": next_steps }))
}
