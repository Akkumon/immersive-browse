# ADR 0002: Fluid direct manipulation

Status: Accepted

Point supplies continuous focus without activation. A stable thumb–index pinch, armed from a settled index-pointing pose, is the only hand gesture that selects, while a stable closed fist supplies 1:1 panning in two dimensions. An open-palm swipe crosses a movement hysteresis threshold once, then transfers its measured 2D velocity into interruptible momentum; it cannot repeatedly fire until re-armed. While the wall is moving or settling, targeting, focus feedback, and selection arming are suspended. Mouse and touch provide equivalent input. Springs are interruptible, momentum inherits input velocity, and input latency takes priority over visual quality.
