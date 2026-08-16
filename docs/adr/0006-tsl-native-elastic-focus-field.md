# ADR 0006: TSL-native elastic focus field

Status: Accepted

Recreate the useful behavior of ElasticMesh inside the existing renderer instead of adding a second OGL canvas. A custom TSL plane shader supplies rounded-box SDF clipping, an edge-derived bevel normal, refracted artwork sampling, restrained RGB dispersion, Fresnel/rim response, and focus displacement. Neighboring tiles receive a smaller spring response.
