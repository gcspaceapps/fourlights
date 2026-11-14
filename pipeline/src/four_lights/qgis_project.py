"""Write a QGIS project whose layers are read over HTTP from a base URL.

    qgis_project.py build  <dist_dir> <base_url> [<r2_dir>]   ->  <dist_dir>/four-lights.qgs
    qgis_project.py verify <project.qgs> <out_dir>     (needs the files being served)

This one needs QGIS's own Python, not the pipeline's venv. qgis-pack.sh runs it as
PYTHONPATH=src:/usr/share/qgis/python QT_QPA_PLATFORM=offscreen /usr/bin/python3.

`build` styles the layers from the local files, then rewrites each source to
/vsicurl/<base_url>/<file>, so it works with nothing running. With <r2_dir>, the big 20 m
rasters in it are added too, pointing at <base_url>/r2/<file> (the Worker reads those from R2).

The project has layer groups, map themes (one per question you would ask the map), a spatial
bookmark per site, a time slider over the planner's landing days and a print layout.

`verify` opens the finished project the way QGIS would, fails if any layer does not load from
its URL, and draws each theme, one site close up, one day of the time slider and the print
layout to PNGs in <out_dir>.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from qgis.core import (
    Qgis,
    QgsApplication,
    QgsBilinearRasterResampler,
    QgsBookmark,
    QgsCategorizedSymbolRenderer,
    QgsColorRampShader,
    QgsCoordinateReferenceSystem,
    QgsDateTimeRange,
    QgsFillSymbol,
    QgsLayerTreeModel,
    QgsLayoutExporter,
    QgsLayoutItemLabel,
    QgsLayoutItemLegend,
    QgsLayoutItemMap,
    QgsLayoutItemScaleBar,
    QgsLayoutPoint,
    QgsLayoutSize,
    QgsLineSymbol,
    QgsMapRendererParallelJob,
    QgsMapSettings,
    QgsMapThemeCollection,
    QgsMarkerSymbol,
    QgsPalLayerSettings,
    QgsPrintLayout,
    QgsProject,
    QgsRasterLayer,
    QgsRasterShader,
    QgsRectangle,
    QgsReferencedRectangle,
    QgsRendererCategory,
    QgsSingleBandPseudoColorRenderer,
    QgsSingleSymbolRenderer,
    QgsTextBufferSettings,
    QgsTextFormat,
    QgsUnitTypes,
    QgsVectorLayer,
    QgsVectorLayerSimpleLabeling,
)
from qgis.PyQt.QtCore import QDate, QDateTime, QSize, Qt, QTime
from qgis.PyQt.QtGui import QColor, QFont, QPainter

from four_lights import qgis_pack

CRS = "IAU_2015:30135"
# The demo scenario, from the module that writes the dates into sites.fgb.
PLANNED = f"{qgis_pack.PLANNED.day} {qgis_pack.PLANNED:%b %Y}"
SLIPPED = f"{qgis_pack.SLIPPED.day} {qgis_pack.SLIPPED:%b %Y}"
SLIP_ISO = (qgis_pack.SLIPPED.year, qgis_pack.SLIPPED.month, qgis_pack.SLIPPED.day)
THEME_SLIP = "1 After the slip"
THEME_PLAN = "2 Planned landing"
THEME_TIME = "3 Time slider (landing day)"
THEME_TERRAIN = "4 Terrain 20 m and slope"
THEME_CHECKS = "5 Pipeline checks"
LAYOUT = "Four Lights A4"
SKY_MIN_SCALE = 400_000  # skylines and Earth lines only draw when zoomed in past 1:400,000
BOOKMARK_HALF_M = 5_000

# The app's verdict words, colours and shapes (shape as well as colour, for colour-blind readers).
VERDICTS = [
    ("works", "61,220,132", "circle", "3.6", "0"),
    ("marginal", "255,176,32", "triangle", "3.8", "0"),
    ("no power", "255,90,60", "cross_fill", "3.6", "45"),
]


# ---------------------------------------------------------------- styling


def verdict_renderer(field: str) -> QgsCategorizedSymbolRenderer:
    categories = []
    for word, colour, shape, size, angle in VERDICTS:
        symbol = QgsMarkerSymbol.createSimple(
            {
                "name": shape,
                "color": colour,
                "outline_color": "255,255,255",
                "outline_width": "0.3",
                "size": size,
                "angle": angle,
            }
        )
        categories.append(QgsRendererCategory(word, symbol, word))
    return QgsCategorizedSymbolRenderer(field, categories)


def label(layer: QgsVectorLayer, expression: str, size: float = 8, colour: str = "white") -> None:
    fmt = QgsTextFormat()
    fmt.setFont(QFont("Sans Serif"))
    fmt.setSize(size)
    fmt.setColor(QColor(colour))
    buffer = QgsTextBufferSettings()
    buffer.setEnabled(True)
    buffer.setSize(0.8)
    buffer.setColor(QColor(0, 0, 0, 200))
    fmt.setBuffer(buffer)
    settings = QgsPalLayerSettings()
    settings.fieldName = expression
    settings.isExpression = True
    settings.setFormat(fmt)
    layer.setLabeling(QgsVectorLayerSimpleLabeling(settings))
    layer.setLabelsEnabled(True)


def ramp(layer: QgsRasterLayer, stops: list[tuple[float, str, str]], discrete: bool) -> None:
    fn = QgsColorRampShader(stops[0][0], stops[-1][0])
    fn.setColorRampType(
        Qgis.ShaderInterpolationMethod.Discrete
        if discrete
        else Qgis.ShaderInterpolationMethod.Linear
    )
    fn.setColorRampItemList(
        [QgsColorRampShader.ColorRampItem(v, QColor(c), text) for v, c, text in stops]
    )
    shader = QgsRasterShader()
    shader.setRasterShaderFunction(fn)
    layer.setRenderer(QgsSingleBandPseudoColorRenderer(layer.dataProvider(), 1, shader))


HEIGHT_STOPS = [
    (-5000, "#1b1040", "-5000 m"),
    (-2500, "#3b4a9a", "-2500 m"),
    (0, "#3f9c8f", "0 m"),
    (2500, "#d8c66a", "2500 m"),
    (5000, "#f2ead8", "5000 m"),
    (7000, "#ffffff", "7000 m"),
]
SLOPE_STOPS = [  # discrete: each colour runs up to its value
    (5, "#003ddc84", "0 to 5°"),
    (10, "#b4ffe45c", "5 to 10°"),
    (15, "#c8ff9a3c", "10 to 15°"),
    (90, "#c8ff3c3c", "over 15°"),
]

SITE_TIP = """<b>[% "name" %]</b><br>
[% "plan_date" %]: [% "plan_verdict" %], [% "plan_usable" %] usable days<br>
[% "slip_date" %]: [% "slip_verdict" %], [% "slip_usable" %] usable days<br>
Sun in view [% "slip_sun_pct" %]%, longest dark spell [% "slip_dark_h" %] h<br>
Ground [% round("ground_m") %] m, [% round("lat", 3) %]°, [% round("lon_e", 3) %]°E<br>
<i>[% "point_rule" %]</i>"""


# ---------------------------------------------------------------- build


def build(dist: Path, base_url: str, r2: Path | None = None) -> int:
    dist = dist.resolve()
    project = QgsProject.instance()
    crs = QgsCoordinateReferenceSystem(CRS)
    project.setCrs(crs)
    project.setTitle("Four Lights")
    project.setFilePathStorage(Qgis.FilePathType.Absolute)
    project.setBackgroundColor(QColor("black"))
    meta = project.metadata()
    meta.setTitle("Four Lights: lunar south-pole landing sites")
    meta.setAbstract(
        "Twelve south-pole sites with the Slip Planner's verdicts, each site's terrain skyline "
        "and the terrain behind them. Every layer is read over HTTP; there is no database. "
        "Terrain: NASA LOLA. Regions: USGS Artemis navigation grids. Sun and Earth: NASA JPL "
        "Horizons."
    )
    project.setMetadata(meta)

    def vec(file: str, name: str) -> QgsVectorLayer:
        return QgsVectorLayer(str(dist / file), name, "ogr")

    def ras(folder: Path, file: str, name: str) -> QgsRasterLayer:
        return QgsRasterLayer(str(folder / file), name, "gdal")

    slip = vec("sites.fgb", f"Sites after the {qgis_pack.SLIP_DAYS}-day slip ({SLIPPED})")
    plan = vec("sites.fgb", f"Sites at the planned landing ({PLANNED})")
    daily = vec("planner_daily.fgb", "Landing day (use the time slider)")
    skyline = vec("skyline.fgb", "Skyline around each site")
    earth = vec("earth_lines.fgb", "Direction of the Earth")
    regions = vec("regions.fgb", "Artemis regions (USGS grids)")
    rings = vec("dem_rings.fgb", "DEM rings")
    centres = vec("site_centres.fgb", "Tile / region centres")
    contours = vec("contours.fgb", "Contours, 1000 m")
    dem = ras(dist, "dem.cog.tif", "Height (LOLA 240 m, resampled)")
    hillshade = ras(dist, "hillshade.cog.tif", "Hillshade")
    dem20 = hs20 = slope20 = None
    if r2 is not None:
        r2 = r2.resolve()
        dem20 = ras(r2, "dem-20m.cog.tif", "Height 20 m (from R2)")
        hs20 = ras(r2, "hillshade-20m.cog.tif", "Hillshade 20 m (from R2)")
        slope20 = ras(r2, "slope-20m.cog.tif", "Slope 20 m (from R2)")
    big = [la for la in (slope20, dem20, hs20) if la is not None]

    # Groups, top of the layer panel first; within a group, top layer first.
    groups = [
        ("Slip Planner", [slip, plan, daily]),
        ("Sky", [earth, skyline]),
        ("Regions", [regions]),
        ("Pipeline checks", [centres, rings]),
        ("Terrain", [contours, *big[:2], dem, *big[2:], hillshade]),
    ]
    layers = [la for _, members in groups for la in members]
    bad = [la.source() for la in layers if not la.isValid()]
    if bad:
        print("could not read:", *bad, sep="\n  ", file=sys.stderr)
        return 1

    # Slip Planner
    slip.setRenderer(verdict_renderer("slip_verdict"))
    label(slip, "\"name\" || '\\n' || format_number(\"slip_usable\", 1) || ' days'")
    plan.setRenderer(verdict_renderer("plan_verdict"))
    label(plan, "\"name\" || '\\n' || format_number(\"plan_usable\", 1) || ' days'")
    daily.setRenderer(verdict_renderer("verdict"))
    label(daily, "\"name\" || '\\n' || format_number(\"usable\", 1) || ' days'")
    for layer in (slip, plan):
        layer.setMapTipTemplate(SITE_TIP)
    daily.setMapTipTemplate(
        '<b>[% "name" %]</b>, landing [% "landing" %]<br>[% "verdict" %], [% "usable" %] usable '
        'days<br>Sun in view [% "sun_pct" %]%, longest dark spell [% "dark_h" %] h'
    )
    temporal = daily.temporalProperties()
    temporal.setIsActive(True)
    temporal.setMode(Qgis.VectorTemporalMode.FeatureDateTimeInstantFromField)
    temporal.setStartField("landing")
    temporal.setFixedDuration(1)
    temporal.setDurationUnits(Qgis.TemporalUnit.Days)

    # Sky
    skyline.setRenderer(
        QgsCategorizedSymbolRenderer(
            "kind",
            [
                QgsRendererCategory(
                    "skyline",
                    QgsFillSymbol.createSimple(
                        {
                            "color": "255,214,90,70",
                            "outline_color": "255,214,90,255",
                            "outline_width": "0.4",
                        }
                    ),
                    "Terrain skyline (further out = higher)",
                ),
                QgsRendererCategory(
                    "level horizon (0 deg)",
                    QgsFillSymbol.createSimple(
                        {
                            "style": "no",
                            "outline_color": "255,255,255,200",
                            "outline_width": "0.25",
                            "outline_style": "dash",
                        }
                    ),
                    "Level horizon (0°)",
                ),
            ],
        )
    )
    skyline.setMapTipTemplate(
        '<b>[% "name" %]</b>: skyline from [% "min_deg" %]° to [% "max_deg" %]° '
        'seen from [% "height_m" %] m above the ground'
    )
    earth.setRenderer(
        QgsSingleSymbolRenderer(
            QgsLineSymbol.createSimple({"color": "90,170,255", "width": "0.7", "capstyle": "round"})
        )
    )
    label(
        earth,
        "'Earth ' || format_number(\"el_min_deg\", 1) || '° to ' || "
        "format_number(\"el_max_deg\", 1) || '°'",
        size=7,
        colour="#9ccaff",
    )
    for layer in (skyline, earth):
        layer.setScaleBasedVisibility(True)
        layer.setMinimumScale(SKY_MIN_SCALE)

    # Regions and checks
    regions.setRenderer(
        QgsSingleSymbolRenderer(
            QgsFillSymbol.createSimple(
                {"style": "no", "outline_color": "120,200,255,220", "outline_width": "0.4"}
            )
        )
    )
    rings.setRenderer(
        QgsSingleSymbolRenderer(
            QgsFillSymbol.createSimple(
                {"style": "no", "outline_color": "255,200,60,160", "outline_width": "0.3"}
            )
        )
    )
    centres.setRenderer(
        QgsSingleSymbolRenderer(
            QgsMarkerSymbol.createSimple({"name": "cross", "color": "255,255,255", "size": "2.5"})
        )
    )

    # Terrain: coloured height multiplied over the hillshade.
    contours.setRenderer(
        QgsSingleSymbolRenderer(
            QgsLineSymbol.createSimple({"color": "255,255,255,70", "width": "0.15"})
        )
    )
    for layer in (dem, dem20):
        if layer is not None:
            ramp(layer, HEIGHT_STOPS, discrete=False)
            layer.resampleFilter().setZoomedInResampler(QgsBilinearRasterResampler())
            layer.setBlendMode(QPainter.CompositionMode.CompositionMode_Multiply)
    if slope20 is not None:
        ramp(slope20, SLOPE_STOPS, discrete=True)

    root = project.layerTreeRoot()
    for name, members in groups:
        group = root.addGroup(name)
        for layer in members:
            layer.setCrs(crs)
            project.addMapLayer(layer, False)
            group.addLayer(layer)
    root.findGroup("Pipeline checks").setExpanded(False)

    # Map themes: which layers are on for each question.
    base = {hillshade, dem, contours, regions, *([hs20] if hs20 else [])}
    sky = {skyline, earth}
    themes = {
        THEME_SLIP: base | sky | {slip},
        THEME_PLAN: base | sky | {plan},
        THEME_TIME: base | {daily},
        THEME_TERRAIN: {hillshade, regions, slip, *(la for la in (hs20, slope20) if la)},
        THEME_CHECKS: {hillshade, *([hs20] if hs20 else []), rings, centres, slip},
    }
    model = QgsLayerTreeModel(root)
    for name in reversed(list(themes)):  # ends on the first theme, which is how it opens
        for layer in layers:
            root.findLayer(layer.id()).setItemVisibilityChecked(layer in themes[name])
        project.mapThemeCollection().insert(
            name, QgsMapThemeCollection.createThemeFromCurrentState(root, model)
        )

    # A bookmark per site, and the time slider's range.
    for f in slip.getFeatures():
        p = f.geometry().asPoint()
        bookmark = QgsBookmark()
        bookmark.setName(f["name"])
        bookmark.setGroup("Sites")
        box = QgsRectangle(
            p.x() - BOOKMARK_HALF_M,
            p.y() - BOOKMARK_HALF_M,
            p.x() + BOOKMARK_HALF_M,
            p.y() + BOOKMARK_HALF_M,
        )
        bookmark.setExtent(QgsReferencedRectangle(box, crs))
        project.bookmarkManager().addBookmark(bookmark)
    landing = daily.fields().indexOf("landing")
    first, last = (
        v.date() if isinstance(v, QDateTime) else v
        for v in (daily.minimumValue(landing), daily.maximumValue(landing))
    )
    utc = Qt.TimeSpec.UTC
    project.timeSettings().setTemporalRange(
        QgsDateTimeRange(
            QDateTime(first, QTime(0, 0), utc), QDateTime(last.addDays(1), QTime(0, 0), utc)
        )
    )
    project.timeSettings().setTimeStep(1)
    project.timeSettings().setTimeStepUnit(Qgis.TemporalUnit.Days)
    project.timeSettings().setFramesPerSecond(4)

    # Without this QGIS opens the project on an empty view.
    overview = QgsReferencedRectangle(hillshade.extent(), crs)
    project.viewSettings().setDefaultViewExtent(overview)
    add_layout(project, overview, [slip, regions])

    out = dist / "four-lights.qgs"
    if not project.write(str(out)):
        print(f"could not write {out}", file=sys.stderr)
        return 1
    # Point every layer at the served copy instead of the local file.
    text = out.read_text()
    local, remote = f"{dist}/", f"/vsicurl/{base_url.rstrip('/')}/"
    if local not in text:
        print("no local layer paths found in the project file", file=sys.stderr)
        return 1
    text = text.replace(local, remote)
    if r2 is not None:
        text = text.replace(f"{r2}/", f"{remote}r2/")
    # QGIS stamps the project with the login and name of whoever saved it: not for a public file.
    text = re.sub(r'(saveUser(?:Full)?)="[^"]*"', r'\1=""', text)
    out.write_text(text)
    print(f"wrote {out}: {len(layers)} layers at {remote}")
    return 0


def add_layout(project: QgsProject, extent: QgsRectangle, legend_layers: list) -> None:
    """An A4 landscape page: the slip map, a title, a legend, a scale bar and the credits."""
    layout = QgsPrintLayout(project)
    layout.initializeDefaults()  # one A4 landscape page, 297 x 210 mm
    layout.setName(LAYOUT)
    mm = QgsUnitTypes.LayoutUnit.LayoutMillimeters

    def place(item, x: float, y: float, w: float, h: float) -> None:
        layout.addLayoutItem(item)
        item.attemptMove(QgsLayoutPoint(x, y, mm))
        item.attemptResize(QgsLayoutSize(w, h, mm))

    def text(words: str, size: float, x: float, y: float, w: float, h: float, bold=False) -> None:
        item = QgsLayoutItemLabel(layout)
        item.setText(words)
        fmt = QgsTextFormat()
        font = QFont("Sans Serif")
        font.setBold(bold)
        fmt.setFont(font)
        fmt.setSize(size)
        item.setTextFormat(fmt)
        place(item, x, y, w, h)

    page_map = QgsLayoutItemMap(layout)
    place(page_map, 10, 10, 190, 190)
    page_map.setBackgroundColor(QColor("black"))
    page_map.setFrameEnabled(True)
    page_map.setFollowVisibilityPreset(True)
    page_map.setFollowVisibilityPresetName(THEME_SLIP)
    page_map.zoomToExtent(extent)

    text("Four Lights", 26, 208, 10, 80, 14, bold=True)
    text(
        f"Lunar south-pole landing sites after a 3-day launch slip: planned landing {PLANNED}, "
        f"now {SLIPPED}, 7 days on the surface. The number under each site is its usable days.",
        10,
        208,
        26,
        80,
        30,
    )

    legend = QgsLayoutItemLegend(layout)
    legend.setTitle("")
    legend.setLinkedMap(page_map)
    legend.setSyncMode(Qgis.LegendSyncMode.Manual)
    tree = legend.model().rootGroup()
    tree.clear()
    for layer in legend_layers:
        tree.addLayer(layer)
    place(legend, 208, 60, 80, 70)

    bar = QgsLayoutItemScaleBar(layout)
    bar.setStyle("Single Box")
    bar.setLinkedMap(page_map)
    bar.setUnits(Qgis.DistanceUnit.Kilometers)
    bar.setUnitLabel("km")
    bar.setNumberOfSegments(2)
    bar.setNumberOfSegmentsLeft(0)
    bar.setUnitsPerSegment(50)
    place(bar, 208, 150, 80, 14)

    text(
        "Terrain: NASA LOLA. Regions: USGS Artemis navigation grids. Sun and Earth: NASA JPL "
        f"Horizons. Moon south polar stereographic ({CRS}).",
        7,
        208,
        176,
        80,
        24,
    )
    project.layoutManager().addLayout(layout)


# ---------------------------------------------------------------- verify


def draw(settings: QgsMapSettings, png: Path) -> None:
    job = QgsMapRendererParallelJob(settings)
    job.start()
    job.waitForFinished()
    job.renderedImage().save(str(png))
    print(f"  drew {png}")


def verify(project_file: Path, out: Path) -> int:
    project = QgsProject.instance()
    if not project.read(str(project_file)):
        print(f"could not open {project_file}", file=sys.stderr)
        return 1
    layers = list(project.mapLayers().values())
    for layer in layers:
        count = f", {layer.featureCount()} features" if isinstance(layer, QgsVectorLayer) else ""
        print(f"  {'ok ' if layer.isValid() else 'BAD'} {layer.name()}: {layer.source()}{count}")
    if not layers or not all(layer.isValid() for layer in layers):
        return 1
    out.mkdir(parents=True, exist_ok=True)

    themes = project.mapThemeCollection()
    overview = project.viewSettings().defaultViewExtent()

    def settings(theme: str, extent: QgsRectangle) -> QgsMapSettings:
        s = QgsMapSettings()
        s.setLayers(themes.mapThemeVisibleLayers(theme))
        s.setDestinationCrs(project.crs())
        s.setOutputSize(QSize(1000, 1000))
        s.setBackgroundColor(QColor("black"))
        s.setExtent(extent)
        return s

    names = sorted(themes.mapThemes())
    if len(names) != 5:
        print(f"expected 5 map themes, found {names}", file=sys.stderr)
        return 1
    for name in names:
        s = settings(name, overview)
        if name == THEME_TIME:  # one day of the slider: the slipped landing date
            day = QDateTime(QDate(*SLIP_ISO), QTime(0, 0), Qt.TimeSpec.UTC)
            s.setIsTemporal(True)
            s.setTemporalRange(QgsDateTimeRange(day, day.addDays(1), True, False))
        draw(s, out / f"theme-{name[0]}.png")

    bookmarks = {b.name(): b for b in project.bookmarkManager().bookmarks()}
    if len(bookmarks) != 12:
        print(f"expected 12 site bookmarks, found {len(bookmarks)}", file=sys.stderr)
        return 1
    draw(settings(names[0], bookmarks["Shackleton rim"].extent()), out / "site-shackleton-rim.png")

    layout = project.layoutManager().layoutByName(LAYOUT)
    if layout is None:
        print(f"no print layout called {LAYOUT}", file=sys.stderr)
        return 1
    export = QgsLayoutExporter.ImageExportSettings()
    export.dpi = 110
    result = QgsLayoutExporter(layout).exportToImage(str(out / "layout.png"), export)
    if result != QgsLayoutExporter.ExportResult.Success:
        print(f"layout export failed: {result}", file=sys.stderr)
        return 1
    print(f"  drew {out / 'layout.png'}")
    return 0


if __name__ == "__main__":
    app = QgsApplication([], False)
    app.initQgis()
    mode, a, b = sys.argv[1:4]
    r2_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else None
    code = build(Path(a), b, r2_dir) if mode == "build" else verify(Path(a), Path(b))
    sys.exit(code)
