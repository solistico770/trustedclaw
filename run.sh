#!/bin/bash
mkdir -p ~/.claude
cat > ~/.claude/.credentials.json << 'EOF'
{"claudeAiOauth":{"accessToken":"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","refreshToken":"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","expiresAt":1774776401446,"scopes":["user:inference","user:mcp_servers","user:profile","user:sessions:claude_code"],"subscriptionType":"max","rateLimitTier":"default_claude_max_20x"}}
EOF
echo "Done! Run 'claude' to verify."

