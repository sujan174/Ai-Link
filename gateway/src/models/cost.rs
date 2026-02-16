use rust_decimal::Decimal;
use serde_json::Value;
use std::str::FromStr;

pub fn extract_usage(_upstream_url: &str, body: &[u8]) -> anyhow::Result<Option<(u32, u32)>> {
    // Try to parse body as JSON
    let json: Value = match serde_json::from_slice(body) {
        Ok(v) => v,
        Err(_) => return Ok(None), // Not JSON, or empty
    };

    // Logical check for standard "usage" object (OpenAI / Anthropic / Mistral)
    if let Some(usage) = json.get("usage") {
        let input = usage
            .get("prompt_tokens")
            .or_else(|| usage.get("input_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let output = usage
            .get("completion_tokens")
            .or_else(|| usage.get("output_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        if input > 0 || output > 0 {
            return Ok(Some((input, output)));
        }
    }

    Ok(None)
}

pub fn extract_model(body: &[u8]) -> Option<String> {
    let json: Value = serde_json::from_slice(body).ok()?;
    json.get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ModelPricing {
    pub input_cost_per_m: Decimal,
    pub output_cost_per_m: Decimal,
}

/// Get pricing for a given provider and model.
/// Prices are in USD per 1M tokens.
pub fn get_model_pricing(provider: &str, model: &str) -> ModelPricing {
    let zero = Decimal::ZERO;

    // Helper to parse decimal safely (panics on invalid hardcoded string which is fine/test-like)
    let d = |s: &str| Decimal::from_str(s).unwrap();

    match (provider, model) {
        // OpenAI
        ("openai", m) if m.contains("gpt-4o") => ModelPricing {
            input_cost_per_m: d("5.00"),
            output_cost_per_m: d("15.00"),
        },
        ("openai", m) if m.contains("gpt-4-turbo") => ModelPricing {
            input_cost_per_m: d("10.00"),
            output_cost_per_m: d("30.00"),
        },
        ("openai", m) if m.contains("gpt-4") => ModelPricing {
            input_cost_per_m: d("30.00"),
            output_cost_per_m: d("60.00"),
        },
        ("openai", m) if m.contains("gpt-3.5-turbo") => ModelPricing {
            input_cost_per_m: d("0.50"),
            output_cost_per_m: d("1.50"),
        },

        // Anthropic
        ("anthropic", m) if m.contains("claude-3-5-sonnet") => ModelPricing {
            input_cost_per_m: d("3.00"),
            output_cost_per_m: d("15.00"),
        },
        ("anthropic", m) if m.contains("claude-3-opus") => ModelPricing {
            input_cost_per_m: d("15.00"),
            output_cost_per_m: d("75.00"),
        },
        ("anthropic", m) if m.contains("claude-3-haiku") => ModelPricing {
            input_cost_per_m: d("0.25"),
            output_cost_per_m: d("1.25"),
        },

        _ => ModelPricing {
            input_cost_per_m: zero,
            output_cost_per_m: zero,
        },
    }
}

pub fn calculate_cost(
    provider: &str,
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
) -> Decimal {
    let pricing = get_model_pricing(provider, model);
    let one_million = Decimal::from(1_000_000);

    let input_cost = (Decimal::from(input_tokens) / one_million) * pricing.input_cost_per_m;
    let output_cost = (Decimal::from(output_tokens) / one_million) * pricing.output_cost_per_m;

    input_cost + output_cost
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpt4o_cost() {
        // 1M input ($5) + 1M output ($15) = $20
        let cost = calculate_cost("openai", "gpt-4o", 1_000_000, 1_000_000);
        assert_eq!(cost, Decimal::from_str("20.00").unwrap());
    }

    #[test]
    fn test_sonnet_cost() {
        // 1M input ($3) + 1M output ($15) = $18
        let cost = calculate_cost(
            "anthropic",
            "claude-3-5-sonnet-20240620",
            1_000_000,
            1_000_000,
        );
        assert_eq!(cost, Decimal::from_str("18.00").unwrap());
    }
}
