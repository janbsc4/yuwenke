Agentic coding changes the optimization target: you're no longer just designing code for humans to read and modify—you're designing a system that an AI can repeatedly inspect, change, validate, and recover within.

A useful way to think about the principles is: make the repository maximally legible, mechanically verifiable, and difficult to put into an invalid state.

Here are the principles I’ve found especially powerful.

1. The code is the truth

Don't rely on documentation, tickets, conventions, or the agent's memory as the authoritative representation of behavior.

If something matters, encode it in:

executable code
types
schemas
tests
assertions
configuration
generated artifacts
CI checks

Documentation should explain the system, but the executable system should adjudicate disagreements.

This is particularly important with agents because they will happily believe stale documentation.

2. Make invalid states unrepresentable

Push correctness into types, schemas, constructors, APIs, and validation rather than asking the agent to "remember" rules.

For example, prefer:

type UserId = string & { readonly __brand: "UserId" };


over passing arbitrary strings everywhere.

Or:

@dataclass(frozen=True)
class Money:
    cents: int
    currency: Currency


rather than passing (amount, currency) pairs throughout the system.

Agent benefit: the compiler becomes a collaborator that tells the agent what it did wrong.

3. Every important invariant should have a machine-enforced guardian

If you care about something, give the repository a deterministic way to detect its violation.

Examples:

formatting → formatter
types → type checker
API compatibility → contract tests
migrations → migration checks
dependency rules → dependency linter
security → scanner
architectural boundaries → architecture tests
generated files → regeneration/diff check
performance budgets → benchmarks
database invariants → integration tests

The key principle is:

Don't tell the agent a rule that you could teach the machine to enforce.

This is probably one of the highest-leverage principles for agentic development.

4. Prefer deterministic feedback over probabilistic judgment

A check that says:

"This code looks suspicious."

is useful.

A check that says:

expected X, got Y

is dramatically better.

Agents perform best when the development loop looks like:

change
  ↓
run checks
  ↓
precise failure
  ↓
inspect failure
  ↓
change
  ↓
run checks


rather than:

change
  ↓
ask human "does this look right?"
  ↓
interpret vague feedback
  ↓
change


You want to turn as much engineering judgment as possible into observable feedback loops.

5. Make the repository self-testing

A strong agentic repository should answer questions about itself.

For example:

./check
./test
./lint
./typecheck
./verify


Ideally an agent can clone the repository and discover:

how to build it
how to test it
how to lint it
how to validate it
how to run the relevant subsystem

without needing a human to explain the workflow.

The repository should be an executable specification of how to work on the repository.

6. Optimize for fast failure

A failing check that takes 45 minutes is much less useful to an agent than one that fails in 3 seconds.

Put cheap, local checks first:

parse
 ↓
format
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
system tests
 ↓
expensive validation


This creates a tight agent feedback loop.

In fact, feedback latency is an architectural property for agentic software.

7. Prefer small, composable changes

Agents are much more reliable when each change has a narrow blast radius.

Good:

add function
→ test function
→ refactor caller
→ tests pass


Bad:

rewrite subsystem
→ update 47 files
→ discover 19 unrelated failures
→ attempt to infer what went wrong


This suggests a broader principle:

Optimize the codebase for incremental change, not just for the final architecture.

8. Preserve locality of reasoning

A developer—or agent—should ideally be able to understand a behavior by inspecting a small region of the repository.

Avoid situations where answering:

"What happens when a user is deleted?"

requires inspecting:

controller
→ event bus
→ middleware
→ plugin
→ background worker
→ database trigger
→ cron job
→ undocumented external service


Prefer explicit flows and localized responsibilities.

The less context an agent needs to hold simultaneously, the more reliable it becomes.

9. Make dependencies explicit

Hidden behavior is particularly dangerous for agents.

Prefer:

def process_order(order, payment_service, inventory):


over:

def process_order(order):
    payment_service = get_global_service()
    inventory = magic_container.resolve(...)


Likewise:

explicit imports
explicit configuration
explicit data transformations
explicit state transitions
explicit error handling

The principle is:

If a dependency matters to correctness, make it visible in the code.

10. Favor boring code over clever code

This becomes even more important with agents.

Humans can recognize clever abstractions and carry their intent forward. Agents are much more likely to imitate the surface structure of code.

Prefer:

if user.is_admin:
    ...


over a five-layer abstraction that ultimately determines whether user.is_admin.

Not because abstraction is bad, but because semantic transparency is valuable to automated programmers.

11. Make state transitions explicit

Agents struggle particularly badly with implicit state.

Prefer:

PENDING → PAID → FULFILLED
             ↓
          REFUNDED


represented explicitly in the domain model.

Then enforce legal transitions:

ALLOWED_TRANSITIONS = {
    PENDING: {PAID, CANCELLED},
    PAID: {FULFILLED, REFUNDED},
    ...
}


This gives both the agent and the tests a concrete model to reason about.

12. Treat tests as executable examples, not just regression barriers

A good test suite tells an agent:

"This is how this API is supposed to be used."

This means test names, fixtures, and test structure matter.

Compare:

def test_17():
    ...


with:

def test_cannot_refund_an_unpaid_order():
    ...


The second is simultaneously:

a regression test
documentation
a specification
a hint to the agent

Tests can therefore serve as high-density semantic documentation.

13. Give agents narrow tools rather than giant powers

This is analogous to capability-based security.

Instead of giving an agent a giant do_everything() interface, expose operations with clear semantics:

read_file
search_code
run_tests
run_typecheck
apply_patch
inspect_schema


Likewise inside the application, narrow APIs are easier for agents to use correctly.

Good interfaces are agent affordances.

14. Make errors actionable

Error messages are part of the agent interface.

Bad:

Invalid configuration


Better:

Invalid configuration: database.pool_size must be >= 1.
Received: 0.
Configuration file: config/production.yaml:42


Best when appropriate:

Invalid configuration: database.pool_size must be >= 1.
Received: 0.
Configuration file: config/production.yaml:42
Suggested fix: set pool_size to a positive integer.


An agent can act on structured errors much more reliably than vague ones.

15. Prefer structured outputs

Machines should communicate with machines using machine-readable representations where possible.

For example:

{
  "status": "failed",
  "rule": "no-circular-dependencies",
  "file": "src/foo.ts",
  "line": 17,
  "message": "foo imports bar, which imports foo"
}


is much more useful to an agent than:

Architecture violation somewhere in foo.ts


This applies to:

test runners
linters
compilers
CLI tools
build systems
observability
migration tools
16. Separate generated truth from authored truth

Agents can easily modify generated files instead of their sources.

Make the distinction mechanically obvious:

schema/
  users.sql              # source

generated/
  users_client.ts        # generated


and enforce:

generate
git diff --exit-code generated/


after generation.

The general rule:

If one artifact derives from another, encode the derivation and verify it.

17. Make reproducibility a first-class requirement

If the agent can't reliably reproduce a failure, it can't reliably fix it.

Control:

dependency versions
build environment
test data
clocks
randomness
external services
database state
network assumptions

Whenever possible:

same commit
+ same inputs
→ same result


Determinism is disproportionately valuable for agents because it lets them perform repeated experiments.

18. Design for cheap rollback

Agents will make bad changes.

That's not an edge case; it's part of the operating model.

So make mistakes cheap:

small commits
isolated changes
reversible migrations
feature flags
transactional operations
clean git state
reproducible builds

A powerful agentic principle is:

The cost of being wrong should be low.

This changes how you design systems.

19. Keep the working tree legible

A surprisingly practical principle.

At any point, you should be able to answer:

What did the agent change?
Why did it change it?
What remains uncommitted?
Which generated files changed?
Which tests are failing?


Avoid workflows that leave enormous amounts of incidental churn.

Small diffs are not merely pleasant for humans—they give agents a much cleaner signal about causality.

20. Make architectural boundaries executable

Don't merely document:

"The domain layer must not depend on infrastructure."

Enforce it.

For example:

domain ─────X────→ database
domain ─────X────→ HTTP framework


Then have CI reject violations.

This leads to a particularly strong principle:

Architecture should be enforced at the boundary, not remembered at the point of change.

21. Prefer explicit conventions over implicit taste

Humans can infer:

"We usually name these things this way."

Agents may not.

Turn conventions into:

naming rules
directory structure
templates
generators
linters
examples
schemas

The ideal convention is:

easy to discover
+
easy to follow
+
easy to verify

22. Give every abstraction a concrete escape hatch

Agents can get trapped in abstractions.

If the repository has:

Repository
Service
Provider
Adapter
Manager
Factory
Registry


but there is no easy way to inspect the underlying behavior, debugging becomes difficult.

Prefer abstractions that preserve observability:

high-level abstraction
        ↓
inspectable concrete behavior


An agent needs to be able to "drop down a level" when its current mental model is wrong.

23. Prefer information-rich structure over comments

A comment says:

# Don't call this after initialization.


A type/state API can make that impossible:

InitializedConnection.send(...)


The latter is substantially better because the constraint exists in the system itself.

So:

Encode knowledge in structure before encoding it in prose.

Comments still matter—but they should explain things that cannot reasonably be encoded.

24. Build "verification ladders"

For significant changes, have progressively stronger checks:

Level 1: syntax
Level 2: formatting/lint
Level 3: types
Level 4: unit tests
Level 5: integration tests
Level 6: contract tests
Level 7: end-to-end tests
Level 8: production-like validation


This gives an agent a natural strategy:

Fix the cheapest failing level before moving upward.

It also makes partial progress measurable.

25. Design for epistemic humility

This one is more subtle.

Agents are dangerous when they can confidently act despite uncertainty.

So design systems where uncertainty becomes visible:

assert condition
validate schema
check invariant
verify generated output
check migration state
check API compatibility


rather than silently proceeding.

In other words:

Turn "I think this is true" into "the system can verify this is true."

The deeper pattern

A lot of these collapse into a few meta-principles.

1. Move knowledge from the agent's context into the repository

Instead of:

"The agent needs to know that X must always be true."

make it:

type
schema
test
assertion
lint rule
CI check

2. Move judgment from humans into deterministic machinery

Instead of:

"A reviewer should notice this."

ask:

"Can a check detect this?"

3. Minimize the amount the agent has to infer

Make:

dependencies explicit
state explicit
contracts explicit
errors precise
conventions discoverable
boundaries enforceable
4. Maximize the quality of the feedback loop

The ideal agentic coding loop is roughly:

        ┌──────────────┐
        │    Intent    │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │     Agent    │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │    Change    │
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │ Deterministic│
        │   Checks     │
        └──────┬───────┘
               ↓
       ┌───────┴────────┐
       │                │
     pass              fail
       │                │
       ↓                ↓
    integrate       precise error
                        │
                        └──→ Agent


The repository becomes part of the agent's reasoning system.

That's probably the most important overarching principle: don't try to make the agent smarter when you can make the environment more legible and more verifiable.
