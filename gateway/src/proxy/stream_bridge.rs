//! Stream bridge: zero-copy SSE passthrough with background accumulation.
//!
//! Provides [`tee_sse_stream`] which takes a reqwest streaming response and:
//! 1. Forwards raw SSE bytes to the client immediately (zero-copy)
//! 2. Feeds each line into a [`StreamAccumulator`] in a background task
//! 3. Resolves a [`StreamResult`] when the stream completes (for audit/cost)

use std::sync::Arc;
use std::time::Instant;

use axum::body::Body;
use bytes::Bytes;
use futures::StreamExt;
use tokio::sync::Mutex;

use crate::proxy::stream::{StreamAccumulator, StreamResult};

/// A shared slot that will be populated with the stream result once the
/// SSE stream completes. The background task writes to this; the caller
/// can await it after the response has been sent to the client.
pub type StreamResultSlot = Arc<Mutex<Option<StreamResult>>>;

/// Tee an upstream SSE response into two consumers:
/// - An [`axum::body::Body`] that streams bytes directly to the HTTP client
/// - A [`StreamResultSlot`] that resolves with accumulated usage/tool-call data
///
/// The `start` instant is used to compute TTFT (time-to-first-token).
///
/// # Usage
/// ```ignore
/// let (body, result_slot) = tee_sse_stream(upstream_resp, Instant::now());
/// // Send body to client immediately
/// let response = Response::builder().body(body).unwrap();
/// // Later (in a spawned task), read the result for audit/cost
/// let result = wait_for_stream_result(&result_slot, Duration::from_secs(300)).await;
/// ```
pub fn tee_sse_stream(upstream_resp: reqwest::Response, start: Instant) -> (Body, StreamResultSlot) {
    let result_slot: StreamResultSlot = Arc::new(Mutex::new(None));
    let slot_for_bg = result_slot.clone();

    let accumulator = Arc::new(Mutex::new(StreamAccumulator::new_with_start(start)));

    let byte_stream = upstream_resp.bytes_stream();

    // We need to track first-chunk for TTFT. Use a shared atomic flag.
    let first_chunk_seen = Arc::new(std::sync::atomic::AtomicBool::new(false));

    let mapped = byte_stream.map(move |chunk_result| {
        match chunk_result {
            Ok(bytes) => {
                // Spawn background accumulation — non-blocking, best-effort
                let acc = accumulator.clone();
                let slot = slot_for_bg.clone();
                let first_seen = first_chunk_seen.clone();
                let bytes_clone = bytes.clone();
                let elapsed_ms = start.elapsed().as_millis() as u64;

                tokio::spawn(async move {
                    let mut acc = acc.lock().await;

                    // Record TTFT on the very first data chunk
                    if !first_seen.swap(true, std::sync::atomic::Ordering::SeqCst) {
                        acc.set_ttft_ms(elapsed_ms);
                    }

                    // Feed each SSE line to the accumulator
                    let text = String::from_utf8_lossy(&bytes_clone);
                    let mut done = false;
                    for line in text.lines() {
                        if acc.push_sse_line(line) {
                            done = true;
                        }
                    }

                    // If stream is done, extract and store the result
                    if done {
                        // Take ownership of the accumulator to call finish() (which consumes self)
                        let finished_acc = std::mem::replace(&mut *acc, StreamAccumulator::new());
                        let result = finished_acc.finish();
                        *slot.lock().await = Some(result);
                    }
                });

                Ok::<Bytes, std::io::Error>(bytes)
            }
            Err(e) => Err(std::io::Error::new(std::io::ErrorKind::BrokenPipe, e.to_string())),
        }
    });

    let body = Body::from_stream(mapped);
    (body, result_slot)
}

/// Wait for the stream result to be populated, with a timeout.
/// Returns `None` if the timeout expires before the stream completes.
pub async fn wait_for_stream_result(
    slot: &StreamResultSlot,
    timeout: std::time::Duration,
) -> Option<StreamResult> {
    let deadline = Instant::now() + timeout;
    loop {
        {
            let guard = slot.lock().await;
            if guard.is_some() {
                drop(guard);
                return slot.lock().await.take();
            }
        }
        if Instant::now() >= deadline {
            return None;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
}
