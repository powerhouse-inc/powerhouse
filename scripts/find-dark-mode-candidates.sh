rg -n \
  --glob '**/*.{ts,tsx,js,jsx,css,scss,html,mdx}' \
  --glob '!**/*.stories.tsx' \
  --glob '!**/*.test.tsx' \
  --glob '!**/*.md' \
  --glob '!**/*.md.**' \
  --glob '!**/eslint.config.js' \
  --glob '!**/*.spec.tsx' \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!apps/academy/**' \
  --glob '!packages/reactor-api/**' \
  --glob '!packages/reactor/**' \
  --glob '!packages/codegen/src/file-builders/document-model/migrate-legacy.ts' \
  --glob '!packages/switchboard-gui/**' \
  --glob '!**/test/**' \
  --glob '!**/tests/**' \
  --glob '!**/build/**' \
  --glob '!**/.next/**' \
  --glob '!**/coverage/**' \
  --glob '!**/.turbo/**' \
  --glob '!**/.nx/**' \
  '\b(?:bg|text|border|ring|shadow|divide|outline|fill|stroke|placeholder|caret|accent|from|via|to)-[^\s"`'"'"'}]+' \
  . \
  | cut -d: -f1 \
  | sort -u \
  | awk '
    BEGIN {
      print "export const darkModeCandidateFiles = ["
    }

    {
      gsub(/\\/,"\\\\")
      gsub(/"/,"\\\"")
      print "  \"" $0 "\","
    }

    END {
      print "];"
    }
  ' > scripts/dark-mode-candidate-files.ts