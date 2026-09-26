Two apps deploy to Cloudflare Workers as static-asset sites: the showcase ([apps/web/wrangler.jsonc](apps/web/wrangler.jsonc)) and the component registry ([apps/registry/wrangler.jsonc](apps/registry/wrangler.jsonc)). Each config runs its own build before deploying, so you don't need to build first.

**1. Log in to Cloudflare (first time only)**

```bash
bunx wrangler login
```

**2. Deploy the showcase site** (Worker `beast-ui-web`)

```bash
bun run web:deploy
```

**3. Deploy the registry** (Worker `beast-ui-registry`)

```bash
bun run registry:deploy
```

When a deploy finishes, the output prints the live `*.workers.dev` URL.

**Other useful commands**

- To upload a preview version without changing what's live (you get a preview URL back):
  ```bash
  bun run web:preview
  ```
  ```bash
  bun run registry:preview
  ```
- To check both configs without deploying anything (this also runs as part of `bun run build`):
  ```bash
  bun run build
  ```

**Custom domain:** the registry config has a commented-out `routes` entry near the bottom. Once your domain is on Cloudflare, uncomment it and put in your hostname, then redeploy.

Your working tree has uncommitted changes in `packages/registry/ui/`. Deploying doesn't need a commit, so those changes will be in what you ship.
