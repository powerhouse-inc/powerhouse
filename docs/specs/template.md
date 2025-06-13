# Tech Spec Template

To use this template:

- Copy the template and fill in relevant sections
- Use the [Mermaid](https://mermaid.js.org/) syntax for diagrams
- Specs should be located in the `docs/specs` directory, or a subdirectory

## Goals

What specific goals are we attempting to achieve with this system? Be specific and link to design doc if necessary. Recall that the goals of the design doc are not the goals of the technical design: one supports the other.

## Usage Overview

Using full sentences and rough drawings, describe how developers interact with this system: what they can expect from it and what problems it solves for them. If this is an NPM package, for example, you would say “Developers can include this in their package.json”.

Do not reiterate what is in a linked design doc.

## Data

Describe the data this system will manage and how the system will manage it. Identify where data passes in and out of the system. Show where data is transformed and what is intended to transform it.

## Interfaces and Abstractions

Define the major abstractions of the system. What are the major interfaces of the system and what is behind them? Are abstractions hiding complexity or are they making the system simpler? Outline how unit testing may affect abstraction decisions.

## Network Messages (optional)

List the messages that will need to be sent over the network. Every field of every message does not need to be filled out, but we should be able to understand the intended purpose and relative size/frequency of each message.

## Performance Considerations (optional)

Identify the hotspots of the system: What will use the most memory? What will use the most CPU or GPU? Describe how you know this, how you will make decisions about it, and specific mitigations put in place. Describe whether or not benchmarks will be required, and a loose idea of what they should measure.

## Security (optional)

Describe the worst case scenario and how your system mitigates this risk. Does a compromised system put other users at risk? Does it put infrastructure at risk? Identify who and what data may be affected. Then make an argument for why it either doesn’t matter or how your system takes this into account.

## Testing

Outline a testing plan. For development, this may involve TDD, integration tests, and/or end user tests on device. Describe the delivery to QA and how you will use environments, branching strategies, etc to insulate testing.

## Rollout

Describe how will the system be released to end users. The target audience should be mentioned with explicit steps of how they will consume the system.

## Unknowns

Use this section to list any unknowns or questions that you have about the system. If there are no unknowns, simply write "None".
