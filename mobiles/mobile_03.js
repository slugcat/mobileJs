/* Mobile specification: pure data, no engine code.
   Schema is documented at the top of engine/mobile-engine.js.

   Every shape is the same 'ovate' leaf (pointed tip, fat rounded base), bent
   along its line of symmetry by the same amount, and rolled 90 deg so its
   axis is horizontal: fat end on the left, pointed end on the right.
   Each child is smaller than its parent and hangs by a string from one end:

     L0
     |-- L01   (large, terminal)  from L0's fat end
     '-- L02   (small)            from L0's pointed end
         |-- L021  (large, terminal) from L02's fat end
         '-- L022  (small)           from L02's pointed end
             |-- L0221 (large, terminal) from L022's fat end
             '-- L0222 (small, terminal) from L022's pointed end
   (The schematic ends at L0222, so it has no children.) */
(function(){
  const BEND = 1.0;
  const FAT = 0.64, TIP = 0.5;   // child size as a fraction of its parent
  function leaf(size, color, kids){
    return { type:'shape', shape:'ovate', size:size, color:color,
             orientation:90, bend:BEND, bendAxis:90, children:kids };
  }
  // fat end of a size-s leaf is at flat (0, s); the tip is at (0, -s)
  const fat = (s, str, node) => ({ at:[0, s],  string:str, node:node });
  const tip = (s, str, node) => ({ at:[0, -s], string:str, node:node });

  const s0 = 120, s01 = s0*FAT, s02 = s0*TIP;
  const s021 = s02*FAT, s022 = s02*TIP;
  const s0221 = s022*FAT, s0222 = s022*TIP;

  window.MOBILE = {
    title: "Untitled (Study No. 3)",
    string: 60,
    root: leaf(s0, 'var(--black-shape)', [
      fat(s0, 80, leaf(s01, 'var(--red)', [])),
      tip(s0, 80, leaf(s02, 'var(--blue)', [
        fat(s02, 70, leaf(s021, 'var(--yellow)', [])),
        tip(s02, 70, leaf(s022, 'var(--red)', [
          fat(s022, 60, leaf(s0221, 'var(--blue)', [])),
          tip(s022, 60, leaf(s0222, 'var(--yellow)', []))
        ]))
      ]))
    ])
  };
})();
