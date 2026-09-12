# Paper Scout quickstart

Paper Scout lets you ask questions about an HTML paper or investigate a highlighted claim from a browser sidebar.

**Current preview:** install the extension manually in Chrome/Chromium 116+ and connect it to a running Paper Scout backend. No extension build or npm install is needed. A public hosted backend and Chrome Web Store installation are not provided by this repository yet.

## For testers and other users

Ask the person sharing Paper Scout for a **backend URL** and, if required, a **backend token**. With their backend running, you do not need Python, Docker, or your own AI API key.

1. Download the [repository](https://github.com/mso-docs/paper-scout) using **Code → Download ZIP** and unzip it, or use a copy shared by the team. If the repository is private, you need access or a shared ZIP.
2. Open **`chrome://extensions`** in Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the **`extension`** folder inside the unzipped project. Choose the folder containing `manifest.json`, not the whole project folder. Keep this folder on your computer.
4. Pin **Paper Scout** from Chrome's extensions menu.
5. Open an HTML paper page, click Paper Scout, then **Open sidebar / Chat with Paper**.
6. Expand **Connection settings**, enter the supplied backend URL and optional backend token, click **Save connection**, and accept Chrome's permission prompt. Leave custom AI overrides disabled in popup Settings.
7. Select **Chat with Paper** and ask a question. To investigate a claim, highlight a passage on the page, switch to **Investigate**, click **Capture current selection**, review the context, and click **Investigate claim**.

Use the paper's HTML version; PDFs are not supported in this preview. An abstract page supplies only the content on that page, not the full paper. Submitted questions and investigations send paper content to the configured backend and its AI provider.

**No backend URL yet?** You can install the extension and preview captured text, but answers require a backend. The team must provide a reachable HTTPS backend, or you can run one locally using the steps below. `http://localhost:8787` always means the computer running your browser; it does not connect to another person's computer.

## For Ruben and developers running locally

1. Clone or pull the latest repository and load `extension/` using the steps above.
2. If `backend/.env` does not exist, copy `backend/.env.example` to `backend/.env`. Edit an existing file instead of overwriting it. Set `LLM_PROVIDER` and the matching API key as described in the example. Keep AI provider keys in this file; the extension's optional backend token is a separate credential.
3. With Docker and Docker Compose installed and running, open a terminal in the repository folder and run:

   ```sh
   cd backend
   docker compose up --build
   ```

   Keep the backend running while using Paper Scout. If you prefer Python, follow the [virtual environment and backend startup instructions](README.md#running-the-backend-locally).

4. Open `http://localhost:8787/health` to check the server. Without a configured backend token, it should return `{"status":"ok","apiVersion":"1.0"}`. If you set `BACKEND_TOKEN`, the health request requires an `Authorization: Bearer <token>` header. A healthy server does not verify the AI credentials.
5. Save **`http://localhost:8787`** in the sidebar's Connection settings, enter the backend token if configured, and accept Chrome's host permission prompt. Open an HTML paper and try a question.

## Updates and common problems

- **After an extension update:** replace the downloaded files or pull the latest code, click **Reload** on Paper Scout's card at `chrome://extensions`, and reopen the popup/sidebar. If you moved the folder, load it unpacked again.
- **Cannot connect:** confirm the backend is running and the saved URL is correct. A remote backend must be reachable from your computer. Click **Save connection** and accept the permission prompt; typing a URL alone does not grant access.
- **Capture denied:** open the Paper Scout toolbar popup on the paper tab again to grant page access. Browser settings pages and PDFs cannot be captured.
- **AI authentication or quota error:** the backend owner must check the configured provider credentials and available quota, then restart the backend after changing `.env`.

## Planned easy installation

The intended public experience is **install from the Chrome Web Store → open a paper → use Paper Scout**. This is planned work, not the current installation flow.

To get there, the team needs to:

- Host a shared HTTPS backend with server-side AI credentials and per-user access/usage limits to control costs.
- Configure the extension with that backend address automatically and provide any required sign-in flow.
- Prepare the store package and privacy disclosures, then submit the extension for Chrome Web Store review.

Before the store release, a shared extension ZIP with the hosted backend address preconfigured can reduce tester setup to unzipping and **Load unpacked**. That distribution package and hosted service still need to be prepared.
