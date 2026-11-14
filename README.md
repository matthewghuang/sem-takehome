Actual time spent: a few minutes over 3h

# Frost Monitor

A React/TypeScript field frost dashboard using shadcn/ui, TanStack Query, and TanStack Table.

## How to run

Install dependencies with `npm ci`, then run `npm run dev` for the dashboard or `npm run build` for the production build.

## Architecture

I structured the application into five layers:

API -> Data -> Domain -> Hooks -> UI Components

Each layer has a distinct responsibility, separating concerns and keeping the application modular and testable.

Data: Transforms and normalizes API responses into consistent data structures.

Domain: Contains business logic, calculations, and application-specific rules.

Hooks: Connects domain logic and data fetching to React, managing loading, error, and UI state.

UI Components: Focuses on presentation and user interactions without needing to understand the underlying data sources.

This separation makes it easier to test business logic independently, change data sources without affecting the UI, and keep React components simple.

I prioritized building the core data flow end-to-end before adding additional features or abstractions.

## Edge cases and assumptions

### Where does the frost-risk logic live, and why there?

The frost-risk logic lives in `domain/fieldSummary.ts`, separate from API fetching and React hooks.

This follows the application's layered architecture and separation of concerns. The domain layer is responsible for business logic, independently of where the data comes from or how it's displayed.

Keeping the frost-risk calculations as pure functions makes them easier to unit test with known inputs and expected outputs, without needing to mock API requests or render React components.

### How did you handle null readings, slow responses and failed requests?

Null temperature readings are excluded from calculations rather than treated as zero, since they represent missing measurements. This prevents missing data from skewing the frost-risk calculations.

There are alternative approaches, such as imputing missing values using averages or interpolation. However, choosing between them involves assumptions about the dataset and could introduce additional bias. I considered that level of statistical analysis outside the scope of a three-hour take-home assignment, so I opted for the simpler, more transparent approach of leaving them out.

I used TanStack Query to manage asynchronous requests, including loading states, retries, and caching.

- Slow responses: TanStack Query manages loading states, allowing the UI to remain responsive while requests are pending.
- Failed requests: Queries are retried using exponential backoff to avoid repeatedly overwhelming an unavailable API.
- Caching: Previously fetched data is cached and can be displayed while fresh data is being requested. This reduces unnecessary network requests and allows the application to remain useful during temporary API failures.

I chose this approach because the data doesn't need to be refreshed constantly. Aggressive refetching would introduce unnecessary latency and network traffic, particularly when the API is experiencing issues.

## Scale and reuse

At 500 fields and 20,000 stations, the main concerns would be API performance, unnecessary rerendering, and presenting large amounts of data effectively.

* Data fetching: With more API calls, a 5% failure rate means more failed requests and retries. Caching becomes increasingly important, alongside batching requests and potentially moving aggregation to the backend.

* Rerendering: I'd focus on minimizing unnecessary rerenders through stable keys, memoization, and localized state. For large tables, virtualization would avoid rendering thousands of rows at once.

* UX: With thousands of stations, I'd introduce better aggregation, filtering, and drill-down views rather than displaying every station at once.

* Shared components: I'd prioritize reusing existing UI components for visual consistency. I used shadcn/ui for its accessible primitives. Generic tables, filters, and loading states could be shared, while domain-specific logic would remain separate.

Ultimately, I'd profile the application first to identify actual bottlenecks rather than introducing optimizations prematurely.

## AI Usage

- I used **oh-my-pi** as my agent harness, with OpenAI's Astra for planning and Sol for implementation.
- I spent the first 30 minutes planning the application with Astra. I made the key architectural decisions, including choosing the libraries, defining the application's layers, and deciding how data fetching and state management would work, before handing the plan off to Sol for implementation.
- AI generated all the implementation code, including components, styling, and tests. My role was primarily planning, reviewing, and directing the agent.
- One thing I noticed was that the agent generated hundreds of tests. This would be excessive for a human developer to write in a three-hour assignment, but with agentic development, extensive automated testing can help the agent catch regressions and validate its own changes.
- I would use adversarial agents to independently review the implementation and challenge the existing tests, identifying missing edge cases and improving test coverage. I also would've liked to add a full E2E test suite to validate the application's core user flows.
- One area I wasn't satisfied with was the UI copy. It's overly verbose, which I've noticed is common with LLM-generated interfaces. Given more time, I would manually refine the wording to make it more concise and natural.

I chose to focus my limited time on architectural decisions, such as API caching, and manually reviewing and validating the implementation rather than writing code myself. I felt this was the most effective use of the three-hour time limit.
