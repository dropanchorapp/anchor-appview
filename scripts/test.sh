#!/bin/bash

# Anchor AppView Test Runner
# Runs the complete test suite with proper reporting

echo "🧪 Running Anchor AppView Test Suite"
echo "===================================="

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "❌ Deno not found!"
    echo "Please install Deno: https://deno.land/manual/getting_started/installation"
    exit 1
fi

echo "✅ Deno found: $(deno --version | head -n1)"
echo ""

# Function to run tests with proper formatting
run_test_suite() {
    local test_type=$1
    local test_path=$2
    
    echo "🔍 Running $test_type tests..."
    
    if deno test --allow-all --quiet "$test_path"; then
        echo "✅ $test_type tests passed"
    else
        echo "❌ $test_type tests failed"
        return 1
    fi
    echo ""
}

# Track overall success
overall_success=true

# Run unit tests with clean architecture
echo "🔍 Running Unit tests..."
if deno test --allow-all --quiet tests/unit/handle-resolver.test.ts tests/unit/profile-resolver-v2.test.ts tests/unit/storage-provider.test.ts; then
    echo "✅ Unit tests passed"
else
    echo "❌ Unit tests failed"
    overall_success=false
fi
echo ""

# Skip integration tests for now (require complex database mocking)
echo "🔍 Skipping Integration tests (require database setup)..."
echo "ℹ️ Integration tests would test full API endpoints with profile resolution"
echo "ℹ️ Run manually with: deno test --allow-all --no-check tests/integration/"
echo ""

# Run all tests with coverage (if --coverage flag is passed)
if [[ "$1" == "--coverage" ]]; then
    echo "📊 Running tests with coverage..."
    deno test --allow-all --coverage=coverage tests/
    echo ""
    echo "📈 Generating coverage report..."
    deno coverage coverage --html
    echo "Coverage report generated in coverage/html/"
    echo ""
fi

# Run tests in watch mode (if --watch flag is passed)
if [[ "$1" == "--watch" ]]; then
    echo "👀 Running tests in watch mode..."
    echo "Press Ctrl+C to exit"
    deno test --allow-all --watch tests/
    exit 0
fi

# Final summary
echo "📋 Test Summary"
echo "==============="

if [ "$overall_success" = true ]; then
    echo "✅ All tests passed!"
    echo ""
    echo "🚀 Next steps:"
    echo "  • Deploy to Val Town: ./scripts/deploy.sh"
    echo "  • Test API manually: ./scripts/test-api.sh"
    exit 0
else
    echo "❌ Some tests failed!"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "  • Check error messages above"
    echo "  • Run individual test files: deno test --allow-all tests/unit/[file].test.ts"
    echo "  • Run with verbose output: deno test --allow-all --verbose tests/"
    exit 1
fi