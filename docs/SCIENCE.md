# Science notes: why the communication model works

The Intent Horizon uses real ideas from astronomy, spacecraft operations, and
information theory. It also makes deliberate game abstractions. This document
keeps those two things separate.

## 1. Propagation delay

Light takes about 4.37 years to travel from Earth to the Alpha Centauri A/B
pair. In the game, that becomes exactly **1,595 simulation days** for every
one-way message.

The delay is not the same thing as bandwidth. A signal can have a high data
rate and still take 4.37 years to arrive. Conversely, a low-rate signal can
start arriving immediately but take a long time to serialize in full. The game
models both effects:

```text
departure → serialization across available windows → 1,595-day propagation → delivery
```

A report takes another 1,595 days to return. A question and answer can
therefore create a three-delay sequence from the original instruction to the
arrival of the answer at the colony. This is why asking permission is a
gameplay choice, not a free pause button.

The setting is an approximation. The simulation uses one common integer-day
clock, a fixed distance, and no relativistic corrections or changing orbital
geometry. Those choices keep the causal model legible.

## 2. The game's bit budget

The game gives each direction one **2,800-bit application window per local
simulation day**. Messages use UTF-8 payload bytes plus a disclosed protocol
envelope. A message larger than one window is serialized across consecutive
windows; its final chunk determines when the message can be delivered.

This is a game rule, not a specification of a real Alpha Centauri radio. We do
not define antenna gain, carrier frequency, noise temperature, coding gain,
link margin, or the actual Deep Space Network. The point is to make the player
feel the difference between:

- **propagation delay:** how long the signal takes to cross space;
- **serialization delay:** how long it takes to put the message onto the
  channel; and
- **queueing delay:** how long earlier messages make a new message wait.

The same budget applies to a short human command and a natural-language
instruction. Daneel's advantage is not a privileged link. He can do more
locally after the instruction arrives.

## 3. What Shannon's theory contributes

Claude Shannon's 1948 theory formalized communication in terms of messages,
signals, channels, noise, and the reliable transmission of information. Its
classic channel-capacity result is commonly written as:

```text
C = B log₂(1 + S/N)
```

where `C` is capacity, `B` is bandwidth, and `S/N` is signal-to-noise ratio.
The Intent Horizon does not simulate a physical noisy channel, so it does not
claim to calculate `C` or reproduce a real radio link.

The useful distinction for the game is this: **the bit rate stays fixed**.
Better local intelligence does not create more physical bits. It changes what
the receiver can do with the bits it receives.

That is why the game does not score raw tool-call count. A message that causes
many irrelevant actions is not better than a shorter message that preserves
the mission's real constraints.

Reference: Shannon, [A Mathematical Theory of Communication](https://doi.org/10.1002/j.1538-7305.1948.tb01338.x), Bell System Technical Journal, 1948.

## 4. From data compression to useful action

Ordinary compression tries to represent the same data with fewer bits and then
recover the original data. The game's central mechanic is different. Earth
does not know the future sequence of actions, so there is no correct 8,429-step
plan waiting to be compressed.

Earth transmits a specification:

```text
G = goal
C = constraints
P = preferences
```

Daneel combines that specification with the local state `s` and selects a
feasible policy:

```text
π(action | s, G, C, P)
```

The result is contingent behavior. If a wetland is flooded, a reactor has
failed, or a new water source is available, the local plan can change without
asking Earth to predict that exact future.

Recent communications research calls related ideas semantic communication,
task-oriented communication, and goal-oriented communication. These fields
ask whether a message helps achieve the task, not only whether the receiver
can reconstruct the sender's symbols. See the IEEE tutorial [Beyond
Transmitting Bits: Context, Semantics, and Task-Oriented
Communications](https://doi.org/10.1109/JSAC.2022.3223408) and the research
overview [Towards Goal-Oriented Semantic Communications](https://arxiv.org/abs/2304.00848).

The game borrows that question as a strategy metric:

```text
intent gain = useful goal progress / transmitted payload bits
```

This is a disclosed game diagnostic, not a universal scientific measure of
intelligence or semantic information.

## 5. Shared codebooks

The Mission II protocol illustrates a different kind of compression. Earth
first sends the full definition of `RESILIENCE-24/v1`: the reserve floors,
ecological limits, siting preference, and allowed actions. After Daneel has
received and acknowledged that definition, a later message can refer to the
version rather than repeat its contents.

The reference is cheap because the two sides now share context. It cannot
smuggle new meaning across the channel. A changed definition is a new version
and must pay the transmission cost again.

So the game distinguishes:

- fewer literal bits through an agreed codebook;
- more useful behavior because the receiver has local context; and
- more actions caused by one instruction.

They are related, but they are not the same measurement.

## 6. Why the spacecraft analogy is fair

Deep-space missions already move away from constant low-level control. NASA's
AstroNav work describes spacecraft determining and controlling their own
trajectories instead of depending on constant Earth updates. NASA's
Distributed Spacecraft Autonomy work likewise focuses on local resource and
task management, reactive operations, and autonomy under communication limits.

The game extends that operational pattern into a social and political problem:
what happens when the communication loop is not minutes or hours, but nearly
nine years for a round trip?

References: [NASA AstroNav](https://www.nasa.gov/mission/astronav/) and [NASA
Distributed Spacecraft Autonomy](https://www.nasa.gov/game-changing-development-projects/distributed-spacecraft-autonomy-dsa/).

## 7. What the player should understand

The intended takeaway is not "AI increases bandwidth." It is:

> The channel remains constrained. Local intelligence changes the usefulness
> of what crosses it.

That usefulness still depends on the human. A vague goal can authorize the
wrong trade-off. A preference can conflict with a hard constraint. A safe
default can miss a deadline. Daneel can act locally, but Earth remains
responsible for deciding what it means to delegate.
