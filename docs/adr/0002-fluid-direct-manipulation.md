# ADR 0002: Fluid direct manipulation

Status: Accepted

Point supplies continuous, lightly filtered focus without activation. Two stable point samples arm selection. On the first raw thumb–index contact sample, targeting freezes immediately—even while gesture stabilization is still confirming the pinch—then the confirmed pinch commits against that locked tile. Curled non-index fingers are valid during the tap; a full fist still wins classification and supplies 1:1 panning in two dimensions. An open-palm swipe crosses a movement hysteresis threshold once, then transfers its measured 2D velocity into interruptible momentum; it cannot repeatedly fire until re-armed. While the wall is moving or settling, targeting, focus feedback, and selection arming are suspended. Mouse and touch provide equivalent input. Springs are interruptible, momentum inherits input velocity, and input latency takes priority over visual quality.
