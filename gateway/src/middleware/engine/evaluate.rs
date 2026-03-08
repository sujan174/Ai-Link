use serde_json::Value;

use crate::models::policy::{Condition, Operator};
use super::super::fields::{self, RequestContext};
use super::operators::{values_equal, compare_numeric, check_in, check_glob, check_regex, check_contains, check_starts_with, check_ends_with};

pub fn evaluate_condition(condition: &Condition, ctx: &RequestContext<'_>) -> bool {
    match condition {
        Condition::Always { always } => *always,

        Condition::Check { field, op, value } => {
            let resolved = fields::resolve_field(field, ctx);
            evaluate_operator(op, resolved.as_ref(), value)
        }

        Condition::All { all } => all.iter().all(|c| evaluate_condition(c, ctx)),

        Condition::Any { any } => any.iter().any(|c| evaluate_condition(c, ctx)),

        Condition::Not { not } => !evaluate_condition(not, ctx),
    }
}

// ── Operator Evaluation ──────────────────────────────────────

/// Compare a resolved field value against an expected value using the given operator.
fn evaluate_operator(op: &Operator, resolved: Option<&Value>, expected: &Value) -> bool {
    match op {
        Operator::Exists => resolved.is_some(),

        _ => {
            let Some(actual) = resolved else {
                return false;
            };
            match op {
                Operator::Eq => values_equal(actual, expected),
                Operator::Neq => !values_equal(actual, expected),
                Operator::Gt => compare_numeric(actual, expected, |a, b| a > b),
                Operator::Gte => compare_numeric(actual, expected, |a, b| a >= b),
                Operator::Lt => compare_numeric(actual, expected, |a, b| a < b),
                Operator::Lte => compare_numeric(actual, expected, |a, b| a <= b),
                Operator::In => check_in(actual, expected),
                Operator::Glob => check_glob(actual, expected),
                Operator::Regex => check_regex(actual, expected),
                Operator::Contains => check_contains(actual, expected),
                Operator::StartsWith => check_starts_with(actual, expected),
                Operator::EndsWith => check_ends_with(actual, expected),
                Operator::Exists => unreachable!(),
            }
        }
    }
}
