// Shared materials for the piping catalogue. Parts may clone and tweak these; never mutate them in place.
export function makeMats(THREE) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    ss_ep: std({ color: 0xe6e9ec, metalness: 1, roughness: 0.06 }),      // electropolished: mirror
    ss_ba: std({ color: 0xd9dde1, metalness: 1, roughness: 0.16 }),      // bright annealed
    ss_mp: std({ color: 0xcfd3d7, metalness: 1, roughness: 0.28 }),      // mechanically polished
    ss_ap: std({ color: 0xb9bcbf, metalness: 0.9, roughness: 0.55 }),    // annealed & pickled: matte grey
    ss_machined: std({ color: 0xc9cdd1, metalness: 1, roughness: 0.3 }),
    ss_cast: std({ color: 0xaeb2b6, metalness: 0.9, roughness: 0.5 }),
    brass: std({ color: 0xc9a157, metalness: 1, roughness: 0.3 }),
    black: std({ color: 0x17181a, metalness: 0.1, roughness: 0.55 }),
    rubber: std({ color: 0x0d0d0e, metalness: 0, roughness: 0.85 }),
    blue: phys({ color: 0x1c5f9e, roughness: 0.4, clearcoat: 0.5 }),
    orange: phys({ color: 0xf0954a, roughness: 0.4, clearcoat: 0.5 }),
    red: phys({ color: 0xc8221c, roughness: 0.35, clearcoat: 0.5 }),
    green: phys({ color: 0x2f8f5b, roughness: 0.4, clearcoat: 0.5 }),
    white: std({ color: 0xf1f1ee, metalness: 0, roughness: 0.45 }),
    pfa: phys({ color: 0xf4f6f4, roughness: 0.35, transmission: 0.75, thickness: 0.004, ior: 1.35, transparent: true, opacity: 0.92 }),
    pfa_solid: phys({ color: 0xeef0ee, roughness: 0.4, clearcoat: 0.3, sheen: 0.3 }),
    glass: phys({ color: 0xffffff, roughness: 0.03, transmission: 1, thickness: 0.002, ior: 1.5, transparent: true }),
  };
}
