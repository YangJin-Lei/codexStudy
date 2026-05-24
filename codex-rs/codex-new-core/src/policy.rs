use crate::models::MergePolicy;
use crate::models::ProjectRecord;

pub(crate) fn merge_policy_for_project(project: &ProjectRecord) -> MergePolicy {
    MergePolicy {
        require_test_pass: project.settings.require_tests,
        ..MergePolicy::default()
    }
}
