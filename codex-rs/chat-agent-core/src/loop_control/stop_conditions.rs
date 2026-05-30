use crate::protocol::Action;

pub fn should_stop_after_action(action: &Action) -> bool {
    matches!(action, Action::Finalize { .. })
}

pub fn should_pause_for_user(action: &Action) -> bool {
    matches!(action, Action::AskUser { .. })
}
