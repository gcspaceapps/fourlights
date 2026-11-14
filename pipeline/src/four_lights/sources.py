"""The raw NASA files the precompute uses: original URL, size and SHA-256.

`rel` is the path under `data/raw/lola/` and under `$NASA_CACHE` (the offline mirror).
SHA-256s are from the mirror's MANIFEST.tsv, taken when the files were first downloaded.
"""

from __future__ import annotations

from dataclasses import dataclass

PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp"
PDS = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG"


@dataclass(frozen=True)
class RawFile:
    rel: str
    url: str
    size: int
    sha256: str

    @property
    def raw_subdir(self) -> str:
        """Folder under data/raw/ (the mirror keeps the same relative path under $NASA_CACHE)."""
        return "spice" if self.rel.startswith("spice/") else "lola"


def _f(rel: str, url: str, size: int, sha: str) -> RawFile:
    return RawFile(rel, url, size, sha)


FILES: dict[str, RawFile] = {
    f.rel: f
    for f in [
        _f(
            "lola-5mpp-sites/Site01_final_adj_5mpp_surf.tif",
            f"{PGDA}/Site01/Site01_final_adj_5mpp_surf.tif",
            40980810,
            "3ba7b97cb00a2bcf21189c3aeb535f65afc21207154ab9f0d43c5bdc1f7e747e",
        ),
        _f(
            "lola-5mpp-sites/Site04_final_adj_5mpp_surf.tif",
            f"{PGDA}/Site04/Site04_final_adj_5mpp_surf.tif",
            40980806,
            "38ff70dbdf2f066c2cfa94a646c3a59d653ce7f6b4528b15fc1b43ee397ce758",
        ),
        _f(
            "lola-5mpp-sites/Site07_final_adj_5mpp_surf.tif",
            f"{PGDA}/Site07/Site07_final_adj_5mpp_surf.tif",
            40980808,
            "38aaee10bb4da4d63e7427aa1ca25c79bdbc649d212079a04990e135462091f8",
        ),
        _f(
            "lola-5mpp-sites/Site07_final_adj.xyzi",
            f"{PGDA}/Site07/Site07_final_adj.xyzi",
            24692736,
            "f741998e09a7c578597b846dc61dcedf48f37e4dee752609da4d32b83a244a1d",
        ),
        _f(
            "lola-5mpp-sites/Site11_final_adj_5mpp_surf.tif",
            f"{PGDA}/Site11/Site11_final_adj_5mpp_surf.tif",
            40980806,
            "58f3372c35bbd6baf38ffd5633c1c96b59bd89dbd252150581d12893a43136e5",
        ),
        _f(
            "lola-5mpp-sites/Site20_final_adj_5mpp_surf.tif",
            f"{PGDA}/Site20/Site20_final_adj_5mpp_surf.tif",
            40980802,
            "e51451f3629ba7cd5cfc1b32c8c0ee3c5c454607488b00ea00cd06a9e301a892",
        ),
        _f(
            "lola-5mpp-sites/Site23_final_adj_5mpp_surf.tif",
            f"{PGDA}/Site23/Site23_final_adj_5mpp_surf.tif",
            70586804,
            "12d280a59cd7580415f6bada638d0abe025ce6727541fddf68d5dc371a6c94cf",
        ),
        _f(
            "lola-87s-5mpp/ldem_87s_5mpp.tif",
            f"{PGDA}/87S/ldem_87s_5mpp.tif",
            3465285714,
            "417a85715406c346e2ecb2fc3abc93d3717121466e3d4950e1a6b977f207b881",
        ),
        _f(
            "lola-polar-gdr/LDEM_875S_20M.LBL",
            f"{PDS}/LDEM_875S_20M.LBL",
            4988,
            "b9973d9566090555a566537e0f86ee9e959138cc42504228bab7515b7d3e6b0f",
        ),
        _f(
            "lola-polar-gdr/LDEM_875S_20M.IMG",
            f"{PDS}/LDEM_875S_20M.IMG",
            115034112,
            "dc16bba853b22fa29e26dc26b411acc180de70478578b2c75c8e6f253f56a9d9",
        ),
        _f(
            "lola-polar-gdr/LDEM_85S_20M.LBL",
            f"{PDS}/LDEM_85S_20M.LBL",
            4991,
            "0cbc74e623ce4af19a84f3d40752f4cc2655d36deb6e35e2d31c1ab3ee64ea9c",
        ),
        _f(
            "lola-polar-gdr/LDEM_85S_20M.IMG",
            f"{PDS}/LDEM_85S_20M.IMG",
            460136448,
            "d900ac0aa97fbb983f9898873ead759d870fdb33978afc17fb4e1fa526aa49b2",
        ),
        _f(
            "lola-polar-gdr/LDEM_75S_60M.LBL",
            f"{PDS}/LDEM_75S_60M.LBL",
            4991,
            "012070ba153284dbbe106df602c6f7c3e005438f044644d36662b62630658dac",
        ),
        _f(
            "lola-polar-gdr/LDEM_75S_60M.IMG",
            f"{PDS}/LDEM_75S_60M.IMG",
            465003008,
            "d6d65d69c81af3936cc667ced1c0bb1dcd2486f8bbb6215ede0645177dac6ce2",
        ),
        _f(
            "lola-polar-gdr/LDEM_75S_240M.LBL",
            f"{PDS}/LDEM_75S_240M.LBL",
            4990,
            "ec07239f41d8abc1a3681495b5799b770c7206b5268b76721d69180df0422e02",
        ),
        _f(
            "lola-polar-gdr/LDEM_75S_240M.IMG",
            f"{PDS}/LDEM_75S_240M.IMG",
            29062688,
            "d031efe2611b17dfbf3c158f5e15dc04cd5719349dcbf6384bb21fd97697c490",
        ),
    ]
}

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
SPICE_FILES: dict[str, RawFile] = {
    f.rel: f
    for f in [
        _f(
            "spice/naif0012.tls",
            f"{NAIF}/lsk/naif0012.tls",
            5257,
            "678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b",
        ),
        _f(
            "spice/pck00011.tpc",
            f"{NAIF}/pck/pck00011.tpc",
            131226,
            "3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1",
        ),
        _f(
            "spice/moon_pa_de440_200625.bpc",
            f"{NAIF}/pck/moon_pa_de440_200625.bpc",
            12863488,
            "60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f",
        ),
        _f(
            "spice/moon_de440_250416.tf",
            f"{NAIF}/fk/satellites/moon_de440_250416.tf",
            19478,
            "a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768",
        ),
        _f(
            "spice/de440s.bsp",
            f"{NAIF}/spk/planets/de440s.bsp",
            32726016,
            "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2",
        ),
    ]
}

MOSAIC_87S = "lola-87s-5mpp/ldem_87s_5mpp.tif"
POLAR_RINGS = [
    # (label file opened by GDAL, km from the site it is used to, product name)
    ("lola-polar-gdr/LDEM_875S_20M.LBL", 60.0, "LDEM_875S_20M"),
    ("lola-polar-gdr/LDEM_85S_20M.LBL", 60.0, "LDEM_85S_20M"),
    ("lola-polar-gdr/LDEM_75S_60M.LBL", 150.0, "LDEM_75S_60M"),
    ("lola-polar-gdr/LDEM_75S_240M.LBL", None, "LDEM_75S_240M"),
]
MOSAIC_87S_KM = 20.0
"""The 5 m mosaic is used to 20 km: beyond that a 20 m pixel subtends < 0.06°, an eighth of a
sector, and the 5 m mosaic would cost 16x the pixels."""


def site_tile(pgda_site: str) -> str:
    return f"lola-5mpp-sites/{pgda_site}_final_adj_5mpp_surf.tif"


def needed(pgda_site: str | None) -> list[RawFile]:
    rels = [MOSAIC_87S]
    for lbl, _, _ in POLAR_RINGS:
        rels += [lbl, lbl.replace(".LBL", ".IMG")]
    if pgda_site:
        rels.insert(0, site_tile(pgda_site))
    return [FILES[r] for r in rels]
