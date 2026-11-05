/* Mobile specification: pure data, no engine code.
   Schema is documented at the top of engine/mobile-engine.js. */
window.MOBILE = {
  title: "Untitled (Study No. 1)",
  string: 70,
  root: {
    type: 'rod',
    children: [
      { offset: -170, string: 60, node: {
          // weight omitted -> derived from area (disc, size 34)
          type:'shape', shape:'disc', size:34, color:'var(--red)'
      }},
      { offset: 90, string: 50, node: {
          type:'rod',
          children: [
            { offset: -70, string: 50, node: {
                type:'shape', shape:'blob', size:26, color:'var(--yellow)'
            }},
            { offset: 60, string: 80, node: {
                type:'rod',
                children: [
                  { offset: -50, string: 40, node: {
                      type:'shape', shape:'crescent', size:24, color:'var(--black-shape)'
                  }},
                  { offset: 55, string: 40, node: {
                      type:'shape', shape:'disc', size:16, color:'var(--blue)'
                  }}
                ]
            }}
          ]
      }}
    ]
  }
};
