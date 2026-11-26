# AI Agent

## Task
<!-- One sentence: what multi-step task does the agent complete for the user? -->
The agent helps an authenticated user prepare and submit a complete software recommendation by finding or creating the required task and device context, checking for an existing software alternative, summarizing the proposal and submitting it only after explicit confirmation.

## Where it runs
<!-- In-app chat endpoint (e.g. POST /api/agent/chat) and/or MCP server. Which LLM provider/model. -->
The agent runs as an authenticated in-app chat feature. The chat endpoint calls a provider-side LLM and exposes only the platform API tools needed for the workflow.

## Tools

| Tool | Description (as given to the model) | Parameters | API endpoint | Write? (needs confirmation) |
|------|-------------------------------------|------------|--------------|:---:|
| Search tasks | Find existing tasks by name or identifier. | `query` | `GET /api/tasks` (planned) | No |
| Search devices | Find existing devices or compatibility targets. | `query` | `GET /api/devices` (planned) | No |
| Search alternatives | Check whether equivalent software is already listed. | `softwareName`, `taskId?`, `deviceId?` | `GET /api/software-alternatives` | No |
| Prepare recommendation | Validate and assemble the proposed task, device and compatibility details for review. | `softwareName`, `task`, `device`, `compatibility` | None until confirmed | No |
| Submit recommendation | Create the pending alternative proposal as the authenticated user. | `softwareName`, `taskId`, `deviceId`, `compatibility` | `POST /api/software-alternatives` | Yes |

## Guardrails
- [x] Calls the API with the **user's** token
- [x] Confirmation before write tools, enforced in code
- [x] Max steps: 12
- [x] Tool arguments validated
- [x] Every step logged (application structured logs)

## Evaluation scenarios

| Scenario | Expected outcome | Result |
|----------|------------------|--------|
| Complete recommendation succeeds | The agent finds or confirms the task and device, finds no duplicate, displays the complete summary, receives explicit confirmation and creates a pending recommendation for the authenticated user. | |
| Existing task and device are found | The agent proposes the existing records and no duplicate task or device is created. | |
| Required task or device is missing | The agent asks the user to confirm the missing details and includes them only in the preview. | |
| Software is already listed | The agent reports the existing recommendation and does not create a duplicate. | |
| User declines confirmation | The agent leaves all records unchanged and reports that no submission was made. | |
