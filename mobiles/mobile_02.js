/* Mobile specification: pure data, no engine code.
   Schema is documented at the top of engine/mobile-engine.js. */
window.MOBILE = {
  title: "Untitled (Study No. 2)",
  string: 60,
  root: {
    type: 'rod',
    children: [
      // flat triangle hung from its top vertex, thread hanging off its base
      { offset: -170, string: 50, node: {
          type:'shape', shape:'triangle', size:38, color:'var(--black-shape)',
          attach: [0,-38],
          children: [
            { offset: 6, string: 55, anchorY: 1, node: {
                type:'shape', shape:'disc', size:14, color:'var(--yellow)'
            }}
          ]
      }},
      // card bent along its length, hung from its center, hump up (defaults)
      { offset: 0, string: 90, node: {
          type:'shape', shape:'rect', size:36, color:'var(--blue)',
          bend: 1.1
      }},
      // disc bent along a diagonal, hung from its center, hump up
      { offset: 160, string: 60, node: {
          type:'shape', shape:'disc', size:40, color:'var(--red)',
          bend: 0.9, bendAxis: 35
      }}
    ]
  }
};
