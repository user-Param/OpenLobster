@AGENTS.md

OpenLobster is an **AI-native software development workspace** inspired by the agent-first experience of Claude Code, Codex, and OpenCode, but designed as a unified platform where developers can interact with an autonomous coding agent through a modern web interface. Instead of feeling like a traditional chatbot with a code editor attached, the UI should feel like a complete development environment centered around the agent: users can create projects and sessions, describe tasks in natural language, let the agent understand the codebase, plan and implement features, read and modify files, execute terminal commands, run tests, inspect diffs, use tools, generate files, and verify results, while the interface continuously exposes useful execution progress and artifacts. The web UI should combine an intuitive AI conversation with a project/file explorer, agent activity and tool execution timeline, code and diff views, terminal output, session history, workspace context, model/provider controls, and different modes such as Planning, Coding, Reviewing, and Testing. It should support both private and eventually shared sessions and be designed around the idea that **the agent is the primary actor connecting the user, project, codebase, tools, and development workflow**. The overall experience should be developer-first, information-rich but clean, highly interactive, persistent, transparent about what the agent is doing, and optimized for moving from **“I want to build/fix/change this” → “the agent implemented it, verified it, and showed me exactly what changed”** with minimal friction. 

## Theme, Colors & Visual Identity

OpenLobster should have a **minimal, developer-focused interface inspired by the overall experience of Claude Code, Codex, and OpenCode**, while establishing its own distinct identity through the OpenLobster brand. The application must support a seamless **Dark Theme and Light Theme**, allowing users to switch between them at any time. The visual identity should incorporate a subtle **lobster-inspired personality** throughout the product, primarily through the OpenLobster logo, small visual details, animations, loading states, and other brand moments, without turning the interface into a playful or cartoon-heavy experience. The design should remain professional, technical, and production-grade while carrying a recognizable lobster vibe.

### Dark Theme

```
Background: #141310
Text:       #F6F5F5
```

The dark theme should use `#141310` as the primary application background and `#F6F5F5` as the primary text color.

### Light Theme

```
Background: #F6F5F5
Text:       #141310
```

The light theme should essentially invert the primary dark/light relationship, using `#F6F5F5` as the application background and `#141310` as the primary text color.

### OpenLobster Brand Color

```
Brand / Accent: #D6493F
```

`#D6493F` is the **primary OpenLobster brand color** and should act as the third foundational color alongside the background and text colors. It should be used intentionally throughout the application for the **OpenLobster logo, brand identity, active/selected states where appropriate, agent loading animations, progress indicators, important interactive elements, highlights, and other subtle branded moments**. The accent should not overwhelm the interface; the overall experience should remain primarily driven by the background and text colors, with `#D6493F` providing recognizable OpenLobster identity.

### Global Typography

The entire OpenLobster frontend should use **Saira** as its global font family. Every piece of interface text—including navigation, headings, buttons, labels, messages, agent activity, settings, project information, and other UI elements—should use Saira consistently to establish a unified visual language.

**Font:** `Saira` 

**Designer:** Omnibus-Type

**Source:** Google Fonts

The overall visual direction should therefore be:

> **Claude Code / Codex / OpenCode-inspired developer UX + OpenLobster's own lobster identity + restrained three-color visual system + Saira typography.**
> 

# **OpenLobster Web Flow**

When a user visits OpenLobster, they first arrive at a public landing page that introduces the product, its capabilities, and the overall OpenLobster experience. From there, the user can sign up or sign in and enter the authenticated application. After authentication, the user can import an existing project/folder or create a new project, after which they enter the main OpenLobster workspace centered around the AI chatbot/agent interface. The web application is intentionally focused on the **remote conversational experience**: users can chat with OpenLobster, create and manage projects, create and switch sessions, browse conversation/session history, restart or continue sessions, and use the various agent capabilities exposed by the backend, following the minimal, developer-focused interaction model of products such as Claude Code and OpenCode. The web client does **not** have direct local filesystem or local-machine privileges; local project modifications and deeper local development capabilities will be handled later through the OpenLobster TUI and Android applications. The complete backend, API, database, worker, agent harness, session system, tools, and supporting services already exist within the same Turborepo, so the frontend implementation must first **read and understand the existing backend architecture, API contracts, session/run/message flows, authentication, and available services before implementing UI functionality**, rather than mocking or inventing backend behavior. The web UI should remain intentionally minimal and focused, with the frontend progressively exposing capabilities that are actually supported by the existing backend.

### Flow

```
Landing Page
      ↓
 Sign Up / Sign In
      ↓
Authenticated Application
      ↓
Create Project
      OR
Import Project / Folder
      ↓
Project Workspace
      ↓
Chat / Agent Interface
      ↓
Sessions
 ├── New Session
 ├── Continue Session
 ├── Switch Session
 ├── Restart Session
 └── Session History
      ↓
Agent Interaction
 ├── Chat
 ├── Planning
 ├── Coding / Agent Tasks
 ├── Review
 ├── Testing
 ├── Tool / Agent Activity
 └── Results / History
```

And the **critical implementation rule** should be explicit:

> **Do not redesign or recreate the backend from the frontend.** The web application must consume the existing OpenLobster APIs and services. Before implementing each feature, inspect the relevant backend routes, schemas, database models, authentication flow, session lifecycle, agent runs, SSE/events, and service contracts so the UI accurately reflects what the backend already supports.
> 

From here, you can define each page individually. I'd recommend we go in this order:

1. **Landing Page**
2. **Sign Up**
3. **Sign In**
4. **Project/Create/Import**
5. **Main Chat Workspace**
6. **Session Sidebar / History**
7. **Agent Activity / Run UI**
8. **Project/Workspace UI**
9. **Settings**
10. **Other supporting states** — loading, errors, empty states, onboarding, etc.

The **Main Chat Workspace** should ultimately be the heart of the application, so I'd spend the most design detail there.

# Landing Page ~

The landing page should immediately communicate:

> **OpenLobster is an AI coding agent that helps developers build, modify, debug, and understand software through natural language.**
> 

And because we're taking inspiration from Claude Code/OpenCode/Codex, it should be **minimal, developer-oriented, and product-focused**, not a huge marketing website.

### Proposed Landing Page Flow

```
┌─────────────────────────────────────────────┐
│ Navbar                                      │
│ OpenLobster        Product  Docs  GitHub    │
│                              Sign In  Start  │
├─────────────────────────────────────────────┤
│                                             │
│              HERO                           │
│                                             │
│       Build with your AI engineer.          │
│                                             │
│  OpenLobster understands your project,      │
│  writes code, runs tools, and helps you     │
│  ship software.                             │
│                                             │
│       [ Get Started ] [ View GitHub ]       │
│                                             │
│          [ OpenLobster Preview ]             │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│             WHAT IS OPENLOBSTER?             │
│                                             │
│       Short explanation of the product      │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│              CAPABILITIES                   │
│                                             │
│   Agent       Projects      Sessions        │
│   Coding      Planning      Review          │
│   Testing     Tools         Multi-model     │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│          HOW OPENLOBSTER WORKS              │
│                                             │
│    Prompt → Understand → Execute → Verify   │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│             THE WORKSPACE                  │
│                                             │
│       Visual representation of the          │
│       OpenLobster development experience    │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│             BUILT FOR DEVELOPERS            │
│                                             │
│   Sessions • Agent • Tools • Projects       │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│                  CTA                        │
│                                             │
│        Start building with OpenLobster      │
│              [ Get Started ]                │
│                                             │
├─────────────────────────────────────────────┤
│ Footer                                      │
└─────────────────────────────────────────────┘
```

### But I would keep the actual page much more minimal

We **shouldn't** make every section a giant marketing block.

The visual hierarchy should be something like:

**Hero → Product demonstration → Capabilities → How it works → Final CTA**

The product itself should be the star.

For example, the hero could have a very simple interaction:

```
              OPENLOBSTER

       Your AI software engineer.

     Build. Debug. Ship. With an agent
        that works alongside you.

        [ Start Building ]

       ┌─────────────────────────┐
       │ > Fix authentication     │
       │                         │
       │ ✓ Found auth.ts         │
       │ ✓ Updated middleware    │
       │ ✓ Running tests         │
       │                         │
       │ 38 tests passed         │
       └─────────────────────────┘
```

That immediately communicates **what OpenLobster actually does** instead of requiring the visitor to read a lot of marketing copy.

### One important branding decision

The lobster theme should be **subtle**.

I wouldn't make the landing page look like a seafood/lobster website 😂.

Instead:

```
Developer Tool
     +
AI Agent
     +
Subtle Lobster Identity
```

The lobster can appear through:

- OpenLobster logo
- small animated lobster mark
- agent/loading states
- subtle illustrations
- brand accent
- easter eggs/micro-interactions

while the overall page remains a serious developer product.

## Sign In / Sign Up Page

Create the OpenLobster Sign In and Sign Up pages as a highly minimal, premium authentication experience inspired by the reference layout. The authentication pages should share the same overall composition, structure, spacing, proportions, and interaction patterns. Use a full-screen two-column layout on desktop, with the authentication experience occupying the left side and a large vertically oriented visual occupying the right side. Place the OpenLobster logo/brand mark in the upper-left corner. The authentication content should be vertically centered and contain a large concise headline, a short supporting description, and an authentication card beneath it. The card should contain a prominent third-party authentication option, a clear divider separating third-party authentication from email authentication, an email input field, and a primary button for continuing with email. Include a small secondary action beneath the authentication card, following the same hierarchy as the reference. The right-side visual should be large, vertically oriented, rounded, and occupy a significant portion of the screen while maintaining balance with the authentication content. The Sign Up page should use the same exact structural design as Sign In while adapting the copy and actions for account creation. Keep the experience extremely minimal and focused, with generous whitespace and no unnecessary navigation, marketing sections, or decorative UI. The design should feel like a polished developer product rather than a generic authentication template. On smaller screens, collapse the two-column layout into a focused single-column authentication experience and hide or reposition the visual when necessary. Implement proper loading, validation, error, disabled, and success states. Make the entire experience responsive, accessible, keyboard-friendly, and production-ready. Do not introduce any new colors, fonts, or design systems; use the existing OpenLobster design system defined earlier in this document.

```
┌─────────────────────────────────────────────────────────────┐
│ OpenLobster                                                  │
│                                                             │
│                                                             │
│        ┌──────────────────────┐      ┌───────────────────┐ │
│        │                      │      │                   │ │
│        │   Authentication     │      │                   │ │
│        │                      │      │                   │ │
│        │   Headline           │      │                   │ │
│        │   Description        │      │    Large          │ │
│        │                      │      │    Vertical       │ │
│        │   ┌──────────────┐   │      │    Visual         │ │
│        │   │ Provider     │   │      │                   │ │
│        │   │              │   │      │                   │ │
│        │   │ ─── OR ───   │   │      │                   │ │
│        │   │ Email        │   │      │                   │ │
│        │   │              │   │      │                   │ │
│        │   │ Continue     │   │      │                   │ │
│        │   └──────────────┘   │      │                   │ │
│        │                      │      │                   │ │
│        │   Secondary Action   │      │                   │ │
│        └──────────────────────┘      └───────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Workspace / Project Management Area

Create the OpenLobster authenticated **workspace and project management interface**. This should be the primary screen users see after signing in, where they can quickly create, import, open, and manage their development projects before entering the main AI coding workspace.

The interface should follow an extremely **minimal, clean, developer-focused application design**. Use a persistent sidebar/navigation area and a spacious main workspace. The sidebar should contain the OpenLobster brand at the top, a prominent **New Project** action, project/workspace navigation, relevant session or conversation history access, and user/account controls near the bottom.

The main workspace should focus entirely on the user's projects. Provide clear actions to **Create New Project** and **Import Project**. Display existing projects as clean, compact project entries/cards containing useful information such as project name, description when available, last activity, and relevant session information. Avoid unnecessary dashboards, analytics, statistics, or decorative widgets.

Users must be able to:

- Create a new project
- Import a project
- View existing projects
- Open a project
- Delete a project
- Manage their project list
- Continue working on previously used projects

Deleting a project must require a confirmation step to prevent accidental deletion.

When the user selects a project, transition them into the project's **main OpenLobster chatbot/agent workspace**. The expected primary flow is:

```
Sign In
   ↓
Workspace
   ↓
Create Project / Import Project
   ↓
Project List
   ↓
Select Project
   ↓
Open Project
   ↓
Main Chat / Agent Workspace
```

The workspace should feel like a professional developer application rather than a traditional SaaS dashboard. Prioritize fast navigation, clear hierarchy, generous whitespace, compact controls, and minimal visual noise.

The web application does **not** have direct local filesystem privileges. Therefore, project importing and project management must use the capabilities exposed by the existing OpenLobster backend rather than assuming browser access to arbitrary local directories or files.

Before implementing the UI, inspect the existing OpenLobster backend and understand the existing **authentication, projects, sessions, messages, runs, API routes, database schemas, and related services**. Do not invent frontend APIs or mock backend functionality when an existing backend implementation already supports the required behavior.

The project workspace should ultimately act as the bridge between authentication and the main agent experience:

**Authenticate → Choose/Create Project → Enter Project → Chat with OpenLobster.**

## Frontend Implementation Rules & Engineering Requirements

The OpenLobster frontend must be implemented with strict repository boundaries and production-grade engineering standards. The AI agent has **read access to the entire OpenLobster repository** and is expected to inspect and understand the existing backend, database schemas, API routes, authentication system, session lifecycle, message/run architecture, SSE events, worker behavior, and available services before implementing frontend functionality. However, the AI agent has **write permission exclusively inside `OpenLobster/apps/web/`**. It must never create, modify, delete, rename, or otherwise alter any file outside `apps/web/`. Existing backend and infrastructure code must be treated as read-only. If a required backend capability does not currently exist, do not modify the backend to accommodate the frontend; instead, clearly identify the limitation and implement only what the existing API and services support. The frontend must consume the existing backend contracts rather than inventing duplicate APIs, mock production behavior, or hardcode assumptions about backend state.

### Strict Write Boundary

```
OpenLobster/
│
├── apps/
│   ├── web/              ← ONLY WRITEABLE DIRECTORY
│   │   ├── ...
│   │   └── ...
│   │
│   ├── api/              ← READ ONLY
│   └── worker/           ← READ ONLY
│
├── packages/             ← READ ONLY
├── docker-compose.yml    ← READ ONLY
├── package.json          ← READ ONLY
└── everything else       ← READ ONLY
```

**Absolute rule:**

The AI may read the entire repository, but may write code **only inside `apps/web/`**.

Do not modify existing backend code, database code, worker code, shared packages, configuration outside the web application, Docker configuration, environment files, or root-level files.

### Repository Understanding Before Implementation

Before implementing any frontend feature, inspect the relevant existing code and understand:

- API routes and request/response contracts
- Authentication and authorization
- Session creation and lifecycle
- Projects
- Messages
- Agent runs
- Run status and lifecycle
- SSE/event streaming
- Session history
- Error responses
- Pagination
- Database-backed state
- Available backend capabilities
- Existing types/contracts
- Existing authentication/session mechanisms
- Existing model/provider behavior where exposed to the frontend

The frontend should be built **around the actual backend**, not around assumptions.

### Production-Grade Frontend Requirements

The implementation should be engineered as a serious production application. Prioritize:

- Strong TypeScript typing
- Clean component architecture
- Clear separation of UI, state, API, and business logic
- Reusable components
- Proper loading states
- Proper empty states
- Proper error states
- Proper retry behavior where appropriate
- Request cancellation where appropriate
- Race-condition prevention
- Correct session synchronization
- Correct streaming/event handling
- Optimistic updates only when safe
- Server-authoritative state where required
- No unnecessary API requests
- No memory leaks
- No stale subscriptions
- No orphaned event listeners
- No uncontrolled polling
- Proper cleanup when navigating between sessions/projects
- Secure handling of authentication state
- No sensitive information exposed in the UI
- No API keys or secrets shipped to the browser
- No secrets hardcoded into frontend source
- No sensitive data written to browser storage unnecessarily
- Proper input validation
- Safe rendering of user-generated content
- Protection against XSS and unsafe HTML rendering
- Safe handling of streamed model output
- Secure error handling without exposing internal backend details

### Responsive Design

The application must work seamlessly across **all practical screen sizes**, not just a specific desktop resolution.

The UI should adapt intelligently to:

- Large desktop monitors
- Standard desktop screens
- Laptops
- Small laptops
- Tablets
- Mobile devices
- Narrow browser windows
- High-resolution displays

Do not simply shrink the desktop interface.

Layouts should **reflow and adapt based on available space**. Sidebars, panels, chat interfaces, project lists, dialogs, navigation, toolbars, and other components should have appropriate responsive behavior.

Avoid:

- Horizontal overflow
- Fixed-width layouts that break on smaller screens
- Content being clipped
- Unusable controls
- Text overflowing containers
- Broken dialogs
- Overlapping panels
- Unreachable actions
- Layout jumps caused by dynamic content

The main application should remain usable even when the browser viewport is significantly smaller or larger than expected.

### UX & Interaction Quality

Interactions should feel smooth and intentional.

Use subtle, purposeful:

- Transitions
- Panel animations
- Sidebar transitions
- Modal transitions
- Loading states
- Message appearance
- Session switching feedback
- Project navigation feedback
- Streaming states
- Button interactions

Animations must **support the interface rather than distract from it**.

Avoid excessive animation, unnecessary motion, or decorative effects that interfere with productivity.

Respect accessibility preferences such as reduced motion where appropriate.

### AI / Chat Interface Requirements

The chat experience is the core of OpenLobster.

It must correctly handle:

```
User message
      ↓
Request
      ↓
Agent run
      ↓
Streaming/events
      ↓
Agent activity
      ↓
Assistant response
      ↓
Completed / failed / cancelled state
```

The UI must accurately represent the backend state instead of pretending that an operation completed before the backend confirms it.

Handle states such as:

```
Idle
Sending
Queued
Running
Streaming
Waiting
Completed
Failed
Cancelled
Paused
Retrying
```

The interface should remain usable while an agent run is executing, and navigation between sessions/projects must not cause state corruption or leaked subscriptions.

### No Emojis

Do **not** use emojis anywhere in the OpenLobster frontend UI.

Use:

- Typography
- Icons
- OpenLobster branding
- Subtle animations
- Layout
- Existing design-system elements

instead of emojis.

### Code Quality

All implementation should be:

- Type-safe
- Maintainable
- Readable
- Modular
- Testable
- Consistent
- Production-oriented
- Free from unnecessary duplication

Avoid hacks, temporary implementations, placeholder logic, unnecessary abstractions, and dead code.

Do not silence TypeScript or lint errors simply to make the application compile.

Do not use unsafe type assertions unless they are genuinely justified.

### Validation Before Completion

Before considering any frontend feature complete:

1. Verify the implementation against the existing backend contract.
2. Check TypeScript compilation.
3. Check linting where available.
4. Check for runtime errors.
5. Test loading states.
6. Test empty states.
7. Test error states.
8. Test authentication boundaries.
9. Test session switching.
10. Test navigation.
11. Test responsive layouts.
12. Test narrow and wide viewports.
13. Check browser console for errors and warnings.
14. Check for failed network requests.
15. Check for leaked subscriptions/listeners.
16. Check that no files outside `apps/web/` were modified.
17. Remove unnecessary code and debug logging.
18. Verify that secrets and sensitive backend information are never exposed to the client.

The goal is not merely to make the UI visually impressive. The goal is to build a **secure, stable, responsive, maintainable, production-quality OpenLobster web client** that correctly integrates with the existing backend while respecting the strict `apps/web/` write boundary.

Use Nextjs + tailwind 

```markdown
## Final Frontend Architecture & Implementation Rules

The web application must be implemented using **Next.js + Tailwind CSS + TypeScript** and should follow the existing conventions already present inside `apps/web/` wherever applicable.

### Framework

- Next.js is the frontend framework.
- Tailwind CSS is the styling system.
- TypeScript is mandatory.
- Use React Server Components by default where appropriate.
- Use Client Components only when interactivity, browser APIs, local state, streaming, or event subscriptions require them.
- Do not introduce another frontend framework or styling system.

### Backend Integration

The frontend must communicate with the existing OpenLobster backend through its existing API contracts.

Before implementing any API-dependent feature:

1. Locate the corresponding backend route.
2. Understand its request schema.
3. Understand its response schema.
4. Understand authentication requirements.
5. Understand authorization requirements.
6. Understand error responses.
7. Understand lifecycle/state transitions.
8. Implement the frontend against the actual contract.

Never invent endpoints, request bodies, response structures, or backend capabilities.

Do not create mock API implementations for functionality that already exists in the backend.

If the backend does not currently support a requested frontend feature, do not modify the backend. Clearly identify the limitation and implement only what can be correctly supported from `apps/web/`.

### Authentication & Security

Authentication must follow the existing backend authentication architecture.

Do not expose:

- API keys
- provider credentials
- JWT secrets
- database credentials
- Redis credentials
- internal service credentials
- private environment variables
- internal backend implementation details

Never place secrets inside client-side JavaScript, `NEXT_PUBLIC_*` variables, localStorage, sessionStorage, URLs, query parameters, or rendered HTML.

Do not log authentication tokens, credentials, private user data, or sensitive API responses.

Use secure cookie/session behavior when supported by the existing backend.

The frontend must respect backend authorization and must never assume that hiding a UI element is sufficient authorization.

### Data & State Management

Clearly separate:

- Server state
- UI state
- Session state
- Authentication state
- Streaming state
- Temporary interaction state

Prefer server-authoritative state for projects, sessions, messages, runs, and other persistent resources.

Do not duplicate persistent backend state unnecessarily inside client state.

Prevent stale data and race conditions when users rapidly:

- switch projects
- switch sessions
- send multiple messages
- navigate between pages
- restart runs
- cancel runs
- reconnect to streams

### Streaming & Real-Time Events

Use the existing backend SSE/event architecture where available.

Streaming connections must:

- reconnect appropriately when required
- handle connection failures
- clean themselves up when leaving a session
- avoid duplicate subscriptions
- handle `Last-Event-ID` or equivalent replay behavior when supported
- correctly handle completed, failed, cancelled, paused, and resumed runs
- never duplicate messages/events
- never lose UI synchronization with the server

Do not implement aggressive polling when an existing event/stream mechanism is available.

### Error Handling

Every network-dependent feature must have intentional handling for:

- loading
- success
- empty state
- validation error
- authentication error
- authorization error
- network failure
- timeout
- server error
- cancelled request
- expired session
- streaming failure

Never expose raw backend stack traces or internal infrastructure errors to users.

Display useful user-facing errors while preserving detailed diagnostics only where appropriate for development.

### Accessibility

The UI must be accessible and keyboard usable.

Ensure:

- semantic HTML
- keyboard navigation
- visible focus states
- accessible buttons and inputs
- appropriate labels
- accessible dialogs
- accessible menus
- appropriate ARIA usage when required
- sufficient text readability
- reduced-motion support
- screen-reader-friendly interaction states

Do not use ARIA as a replacement for proper semantic HTML.

### Responsive Architecture

Design components from the beginning to support responsive layouts rather than adding responsiveness afterward.

Important application areas such as:

- sidebar
- project list
- chat
- message composer
- session navigation
- dialogs
- agent activity
- settings
- navigation

must have intentional behavior at different viewport sizes.

Do not rely on fixed pixel dimensions for major application layouts.

### Performance

The frontend should remain fast even with:

- long conversations
- large project lists
- many sessions
- long streamed responses
- frequent agent events
- repeated navigation

Avoid unnecessary re-renders and unnecessary API requests.

Use virtualization or pagination where the existing backend/data size makes it appropriate.

Do not load large client-side dependencies when a smaller native/browser/Next.js solution is sufficient.

### Browser Safety

Never trust user-generated content.

Treat:

- user messages
- project names
- session names
- assistant output
- tool output
- file names
- error messages
- streamed content

as untrusted data.

Avoid unsafe HTML rendering.

If Markdown or rich content must be rendered, sanitize it appropriately and ensure that executable content cannot be injected.

Never execute arbitrary code received from the model directly inside the browser.

### File & Repository Boundary

The AI has read access to the entire repository but has write access ONLY to:

`apps/web/`

It must not modify:

- `apps/api/`
- `apps/worker/`
- `packages/`
- database files
- migrations
- Docker files
- environment files
- root configuration
- root package files
- any other directory outside `apps/web/`

Do not solve frontend problems by modifying backend code.

If a frontend implementation requires a backend change, stop and report the missing backend capability instead of modifying it.

### Dependency Rule

Do not introduce unnecessary dependencies.

Before adding a dependency, determine whether the existing Next.js, React, Tailwind CSS, browser APIs, or existing `apps/web/` dependencies can solve the problem.

Do not modify root-level dependency manifests or lockfiles because of frontend implementation unless the existing repository explicitly permits changes within the web application package.

### Validation

After implementation, verify:

- TypeScript
- Next.js build
- lint
- routes
- authentication
- API integration
- SSE/event handling
- project lifecycle
- session lifecycle
- error states
- loading states
- empty states
- responsive layouts
- keyboard navigation
- browser console
- network requests
- memory/subscription cleanup
- security-sensitive data exposure
- repository write boundary

Do not claim a feature is complete if it has known runtime errors, TypeScript errors, broken API contracts, console errors, or unresolved implementation problems.

The goal is not to promise theoretical perfection. The goal is to leave the application with **zero known critical bugs, errors, security issues, broken states, or unresolved implementation problems** at the time of completion.

## Implementation Principle

Before writing code:

**Read → Understand → Plan → Implement → Validate → Fix → Revalidate**

Do not immediately start generating components without first understanding the existing repository and backend architecture.

The frontend should be a thin, reliable, secure client of the existing OpenLobster platform—not a second backend implemented inside the browser.
```

And yes: **Next.js + Tailwind CSS + TypeScript** should be the fixed frontend stack.