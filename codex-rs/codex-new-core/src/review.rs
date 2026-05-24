use crate::manifest::TaskManifest;
use crate::models::DiffBundle;
use crate::models::MergePolicy;
use crate::models::ReviewDisposition;
use crate::models::ReviewIssue;
use crate::models::ReviewReport;
use crate::models::ReviewSeverity;

pub(crate) fn review_manifest(
    manifest: &TaskManifest,
    diff: &DiffBundle,
    policy: &MergePolicy,
) -> ReviewReport {
    let mut disposition = ReviewDisposition::Informational;
    let mut issues = Vec::new();

    for file in &diff.files {
        if policy
            .sensitive_file_patterns
            .iter()
            .any(|pattern| file.path.contains(pattern))
        {
            disposition = ReviewDisposition::Blocked;
            issues.push(ReviewIssue {
                severity: ReviewSeverity::High,
                path: Some(file.path.clone()),
                message: "Sensitive file changed.".to_string(),
            });
        }
        if file.is_lockfile && !policy.allow_lockfile_merge_without_reason {
            disposition = max_disposition(disposition, ReviewDisposition::NeedsUserApproval);
            issues.push(ReviewIssue {
                severity: ReviewSeverity::Warning,
                path: Some(file.path.clone()),
                message: "Lockfile changed and requires user approval.".to_string(),
            });
        }
    }

    if manifest.changed_files.len() as u32 > policy.max_auto_merge_files {
        disposition = max_disposition(disposition, ReviewDisposition::NeedsUserApproval);
        issues.push(ReviewIssue {
            severity: ReviewSeverity::Warning,
            path: None,
            message: format!(
                "Large change set: {} files changed.",
                manifest.changed_files.len()
            ),
        });
    }

    if issues.is_empty() {
        issues.push(ReviewIssue {
            severity: ReviewSeverity::Info,
            path: None,
            message: "No policy issues detected.".to_string(),
        });
    }

    let summary = match disposition {
        ReviewDisposition::Informational => "Ready for normal user review.",
        ReviewDisposition::NeedsUserApproval => "Change requires explicit user approval.",
        ReviewDisposition::Blocked => "Change is blocked by policy and needs intervention.",
    }
    .to_string();

    ReviewReport {
        disposition,
        issues,
        summary,
    }
}

fn max_disposition(left: ReviewDisposition, right: ReviewDisposition) -> ReviewDisposition {
    use ReviewDisposition::*;
    match (left, right) {
        (Blocked, _) | (_, Blocked) => Blocked,
        (NeedsUserApproval, _) | (_, NeedsUserApproval) => NeedsUserApproval,
        _ => Informational,
    }
}
