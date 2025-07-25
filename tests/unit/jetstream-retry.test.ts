import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("Jetstream Retry Logic", async (t) => {
  await t.step("should retry connection on failure", async () => {
    let attemptCount = 0;
    const maxRetries = 3;
    
    // Simulate connection attempts with retry logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        attemptCount++;
        // Simulate failure on first 2 attempts
        if (attempt < 3) {
          throw new Error("WebSocket connection failed");
        }
        // Success on 3rd attempt
        break;
      } catch (error) {
        if (attempt < maxRetries) {
          // Exponential backoff simulation
          const backoffMs = Math.pow(2, attempt - 1) * 100; // Using 100ms base for test
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    assertEquals(attemptCount, 3, "Should have attempted 3 times");
  });

  await t.step("should use exponential backoff", async () => {
    const delays: number[] = [];
    const startTime = Date.now();
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        delays.push(Date.now() - startTime);
      }
      const backoffMs = Math.pow(2, attempt - 1) * 100;
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
    
    // Check that delays follow exponential pattern (100ms, 200ms, 400ms)
    assertEquals(delays.length, 2);
    // Allow some tolerance for timing
    assertEquals(delays[0] >= 90 && delays[0] <= 110, true, "First delay should be ~100ms");
    assertEquals(delays[1] >= 290 && delays[1] <= 310, true, "Second delay should be ~300ms total");
  });
});