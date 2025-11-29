# ESLint, Prettier & Git Hooks Setup

## ✅ What's been configured:

### 1. **Prettier** - Code Formatter

- Configuration file: `.prettierrc`
- Ignore file: `.prettierignore`
- Settings:
  - No semicolons
  - Single quotes
  - 2-space indentation
  - 100 character line width
  - ES5 trailing commas

### 2. **ESLint** - Code Linter

- Configuration file: `eslint.config.js` (ESLint 9 flat config)
- Plugins configured:
  - TypeScript ESLint
  - Vue ESLint
  - Prettier integration
- Rules:
  - Warn on console statements
  - Warn on unused variables (with `_` prefix exception)
  - Warn on explicit `any` types
  - Disabled multi-word component names for Vue

### 3. **Git Hooks** - Pre-commit Linting

- Using Husky for git hooks management
- Using lint-staged for running tasks on staged files
- Pre-commit hook runs:
  - ESLint with auto-fix on `.js`, `.ts`, `.vue` files
  - Prettier formatting on all applicable files

## 📝 Available Scripts

Run these commands in your terminal:

\`\`\`bash

# Run ESLint

pnpm lint

# Run ESLint with auto-fix

pnpm lint:fix

# Format all files with Prettier

pnpm format

# Check if files are formatted (CI/CD)

pnpm format:check
\`\`\`

## 🔧 How It Works

1. **On every git commit**, the pre-commit hook automatically:
   - Runs ESLint on staged `.js`, `.ts`, `.vue` files
   - Auto-fixes issues when possible
   - Formats code with Prettier
   - Prevents commit if there are unfixable errors

2. **Manual formatting**: Run `pnpm format` anytime to format all files

3. **CI/CD integration**: Use `pnpm lint` and `pnpm format:check` in your CI pipeline

## 🚀 Next Steps

- The git hook will now automatically lint and format your code before every commit
- All files have been formatted to match the new configuration
- The commit was successful with all checks passing!
