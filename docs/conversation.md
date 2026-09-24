# Practice with Léi

The Converse tab uses each signed-in learner's current local progress, including changes waiting to sync. Learning words and words recognized but not yet produced become practice targets. Known words provide support, and concept cards provide grammar guidance. Unseen cards are not assumed known.

Léi replies in short Chinese sentences, with expandable pinyin, a translation, a possible answer, and brief corrections in English or Spanish. The recap links practiced words back to their cards without changing their learning status. The header displays MiMo-V2.6-Flash and updates from the model selected by the backend.

Each new Mandarin attempt can receive a clickable naturalness indicator below the learner's message: Natural, Mostly natural, or Needs work. Expanding it shows Léi's explanation and a suggested sentence when improvement is needed. This assessment is generated with the normal reply, not an extra inference request. Start/help requests and older history without an assessment remain ungraded. These are AI suggestions, not proficiency scores. Reply audio uses the app's existing Chinese voice and mute settings.

The browser saves the latest twelve exchanges separately for each account and interface language. A new conversation asks before deleting history. The backend sends bounded conversation history and selected vocabulary to OpenCode Go, without account names or email addresses. It does not store transcripts.

## Hosting and authentication

The site stays on GitHub Pages. Firebase's existing free sign-in and Firestore progress syncing remain unchanged. A Cloudflare Worker verifies Firebase ID tokens using Google's public signing keys, checking the signature, project, issuer, expiry, identity, and sign-in provider. Anonymous accounts cannot use inference. No Firebase administrator credentials or billing upgrade are required.

A single SQLite-backed Durable Object stores only per-user and global usage counters. It reserves both counters in one transaction before inference, including concurrent requests. This storage type is available on Cloudflare's Workers Free plan. Requests stop when platform allowances are exhausted; keep the account on the Free plan to avoid paid overages. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

The Google public-key cache is managed by `jose`. Like Firebase's default token verification, this checks token validity, not immediate account revocation. An already issued ID token can remain usable until it expires.

## Deploy

1. Install dependencies, verify the feature, and sign in to a free Cloudflare account:

   ```sh
   npm ci
   npm run lint
   npm run check
   npm test
   npm run build
   npx wrangler login
   ```

2. Review `worker/wrangler.jsonc`. It contains the Firebase project ID, exact permitted website origin, model, usage limits, and the SQLite Durable Object binding. It contains no secrets. The Worker exposes only `POST /conversation` and its CORS preflight.

3. Deploy the Worker, then store the inference key using Wrangler's secret prompt. The Worker rejects inference until its secret exists:

   ```sh
   npm run deploy:chat
   npx wrangler secret put OPENCODE_GO_API_KEY --config worker/wrangler.jsonc
   ```

   Never put the key in browser configuration, repository variables, source, or command-line arguments. The private `.env/` folder is ignored and is not read by the browser or uploaded with the Worker.

4. Set these GitHub Actions repository variables, using the URL printed by Wrangler, then deploy the Pages site:

   ```text
   PUBLIC_CHAT_ENABLED=true
   PUBLIC_CHAT_API_URL=https://yuwenke-lei.YOUR-SUBDOMAIN.workers.dev/conversation
   ```

   Keep the existing public Firebase variables. The API URL is public; the inference key is a Worker secret.

5. Sign in and start a conversation in both languages. Check pinyin, corrections, response time, and the model label. Use a second account to verify history separation. A live model test is separate from mocked automated tests.

`npm run deploy:chat` validates and rebuilds the card catalog from the source CSV before uploading. Deploy the Worker again after changing the catalog. CI builds and tests the Worker but does not deploy it or access the inference key.

## Local development

Run `npm run dev:chat -- --var ALLOWED_ORIGIN:http://localhost:4321`. Wrangler uses local Durable Object storage by default. Put `OPENCODE_GO_API_KEY` in the ignored `worker/.dev.vars` file for local inference. Authentication still verifies real Firebase sign-ins; there is no production authentication bypass.

Put the public Firebase configuration, `PUBLIC_CHAT_ENABLED=true`, and `PUBLIC_CHAT_API_URL=http://localhost:8787/conversation` in the root `.env.local`. This file can coexist with the private `.env/` directory. Restart the Astro server after changing public environment values.

## Usage limits

Default limits are 30 attempts per user per UTC day, six per calendar minute, 300 globally per UTC day, and 3,000 globally per UTC month. Failed provider requests still consume an attempt because they may have incurred inference usage. There are no automatic inference retries. Multiple accounts share the global allowance.

Requests have a 128 KiB body limit, bounded message history, and a server-selected vocabulary context. Provider output is limited to 4,096 tokens and a 60-second timeout, with a 70-second browser timeout. GLM-5.3 models use low reasoning effort so their required thinking leaves room for the structured reply. Timeouts show a specific retry message. Invalid provider output and unavailable service leave the learner's draft intact. Guest and offline flashcard study remain available.

Set `CHAT_ENABLED` to `"false"` in the Worker configuration and redeploy to stop inference, including requests from old browser bundles. `PUBLIC_CHAT_ENABLED=false` hides access in newly built clients but does not disable the backend.

These limits constrain requests, not money. OpenCode's subscription allowances still apply. Leave paid provider overages disabled if you require a fixed subscription cost. OpenCode [describes Go as a coding-agent service](https://dev.opencode.ai/docs/go/#where-can-i-use-it); confirm shared language-tutoring use is permitted before public launch. Successful inference alone does not establish permission. The client identifies itself honestly as `Yuwenke-Language-Practice/1.0` and sends a stable, opaque conversation UUID.

## Implementation and verification

`shared/chat.ts` defines the request and response contract. `worker/src/tutor.ts` selects vocabulary and calls MiMo-V2.6-Flash. `worker/src/auth.ts` verifies Firebase identities. `worker/src/index.ts` handles requests and reserves usage counters using `quota.ts`. `src/lib/chatClient.ts` sends the signed-in user's ID token to the Worker.

Tests cover signed JWT validation, unauthorized requests, provider errors, vocabulary selection, account-separated history, model labels, and draft preservation. Miniflare runs the compiled Worker and SQLite Durable Object to test concurrent reservations against real local storage. Existing Firestore rules and progress-sync tests continue to protect learner data.
