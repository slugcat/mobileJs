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
  const TILT = 23;               // extra degrees of tilt per level, rounded end rising
  // dark green, each step lighter: parent < big child < small child (< its own children ...)
  function green(step){
    const base = [12,38,24], f = step*0.1;
    return '#' + base.map(v=>Math.round(v+(255-v)*f).toString(16).padStart(2,'0')).join('');
  }
  const FAT = 0.64, TIP = 0.5;   // child size as a fraction of its parent
  // level 0 = L0 (hangs level); each level down is tilted TILT deg more than its parent.
  // orientation 90 = fat end left; a negative slope raises the fat (left) end.
  // The engine solves where each leaf's thread must tie (its attach point) so that
  // the leaf, with its children's weights, really hangs at that tilt. See the build sheet.
  function leaf(id, level, size, color, kids){
    return { id:id, type:'shape', shape:'ovate', size:size, color:color,
             orientation:90, targetSlope:-TILT*level, bend:BEND, bendAxis:90,
             children:kids };
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
    buildSheet: true,
    hideJoints: true,   // no dots where strings meet leaves
    root: leaf('L0', 0, s0, green(0), [
      fat(s0, 80, leaf('L01', 1, s01, green(1), [])),
      tip(s0, 80, leaf('L02', 1, s02, green(2), [
        fat(s02, 70, leaf('L021', 2, s021, green(3), [])),
        tip(s02, 70, leaf('L022', 2, s022, green(4), [
          fat(s022, 60, leaf('L0221', 3, s0221, green(5), [])),
          tip(s022, 60, leaf('L0222', 3, s0222, green(6), []))
        ]))
      ]))
    ])
  };
})();
