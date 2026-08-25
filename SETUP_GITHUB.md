# Pushing this repo to GitHub

1. Create a new empty repo on GitHub (no README/gitignore — you already have them):
   https://github.com/new

2. On your local machine, from this project folder:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git commit -m "Initial project scaffold"
   git push -u origin main
   ```

3. Add your friend as a collaborator:
   - Go to your repo on GitHub → Settings → Collaborators
   - Click "Add people" → enter their GitHub username or email → send invite
   - They accept via email/notification, then can clone and push

4. Recommended branch workflow:
   - `main` — stable/working code only
   - Each of you works on a feature branch (e.g. `feature/ai-interview`, `feature/discourse-room`)
   - Open a Pull Request to merge into `main` so you can review each other's code
