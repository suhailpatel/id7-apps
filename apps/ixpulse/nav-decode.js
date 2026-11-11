// Adapted from Redline nav.js (cauliflowermossgrape/idrive7-apps), MIT.
'use strict';
/**
 * Part of Redline's experimental features; README.md in this folder has the whole picture.
 *
 * Redline's own directions on the HUD, the data side: what BMW's guidance
 * service says about the next turn and the lanes, decoded into one small object the HUD draws (hud-nav.js).
 *
 * Where it comes from (proven on a G21 with CarPlay / Apple Maps, 2026-11-09, Redline 1.16.5 probe):
 *   - GuidanceEventList.queryContent (navlog.js asks it while a route runs): viewContent[0].eventsInView[], each a
 *     union keyed by its kind (intersection, branch, roundabout, destinationManeuver, ...). The first is the next
 *     turn; a second one, when there, is the turn after it (its distance unit NONE).
 *   - Guidance.currentLaneGuiding and ProjectedModeGuiding.currentLaneGuiding (the same rows, ~1 Hz while lanes
 *     apply; rows: [] when none).
 *   - Guidance.conclusiveDart, the same union under .maneuver: BMW's own navigation (CarPlay leaves it empty).
 *   - Whether a route runs: Guidance.guidanceState / guidingProvider, CarPlay's and Android Auto's
 *     projectedGuidanceActive (guidanceState stays INACTIVE during CarPlay routes).
 * The interfaces are the ones jaimeen77's Cluster Redline reads (jaimeen77-cmyk/apps, MPL-2.0); none of its code
 * is used here, the decoder is Redline's own, written from the replies this car sent.
 *
 * The object (null when there's nothing to show):
 *   { kind, dir, geom, exit, exitAngle, side, flag, stop, dist: '450', unit: 'm', road, lanes, unreliable, t, src }
 *   kind: 'turn' (dir: TurnDirection: STRAIGHT_ON, LEFT, SLIGHT_LEFT, HARD_LEFT, UTURN_LEFT, the right ones, NONE),
 *         'branch' (dir: BranchType: BRANCH_LEFT, FORK_RIGHT, TRIPLE_FORK_STRAIGHT, HIGHWAY_OUT_RIGHT, OVERPASS...),
 *           both with geom: detailedGeometry (ManeuverGeometry: EXIT_RIGHT_TAKE_LEFT, THREE_WAY_FORK_TAKE_CENTER...)
 *           when the car gives one (null for UNDEFINED, the only value seen yet),
 *         'roundabout' (exit: the exit's number, exitAngle as the car gives it, side: the traffic side 'left' / 'right'),
 *         'keep' (dir LEFT / RIGHT: along the main road), 'lanechange' (dir LEFT / RIGHT),
 *         'destination' (dir: LEFT / CENTER / RIGHT / NOT_DIGITIZED; flag false: a stopover, stop its number),
 *         'transport' (dir FERRY / CAR_TRAIN: onto a ferry or a car train),
 *         'follow' (a kind not in the car's catalog: "follow the route")
 *   Not turns, skipped, so they never stand in for the next turn: points of interest, lane rows, traffic, route
 *   segments, tunnels, borders, toll gates, passive manoeuvres (straight through), speed cameras and limits,
 *   dangerous curves, school zones, placeholders (GAP / LOADING_INDICATOR).
 *   dist, unit: as the car formats them ('1' 'km', '450' 'm'); null when it gives none
 *   lanes: { lanes: [{ follow, others: [], hi, info }], rec, markers } or null
 *
 * Safety: a turn older than STALE_MS isn't shown. While a route runs and Redline has no turn it can read (for
 * GIVE_WAY_MS), view() says to give way, so the driver gets BMW's own card rather than nothing.
 * Never throws: everything is caught. Street names never go to a log (their length only).
 */

const STALE_MS = 3000;       // a turn or lanes older than this aren't shown
const NEAR_M = 1000;         // "Near turns": under this ("1 km" is not yet; lanes always)

const UNITS = { KM: 'km', METER: 'm', MILE_UK: 'mi', MILE_US: 'mi', YARD: 'yd', FEET: 'ft' };
const UNIT_M = { km: 1000, m: 1, mi: 1609.344, yd: 0.9144, ft: 0.3048 };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && isFinite(v) ? String(v) : null);

/*
 * The enums that decide an arrow, from the car's catalog (navigation.GuidingTypes, CommonTypes.DistanceUnit):
 * index = the number a firmware might send instead of the name. A value that is neither a name nor one of these
 * numbers gives no direction (the "follow the route" dot), never a guessed arrow.
 */
const ENUMS = {
    TurnDirection: ['NONE', 'STRAIGHT_ON', 'LEFT', 'SLIGHT_LEFT', 'HARD_LEFT', 'RIGHT', 'SLIGHT_RIGHT', 'HARD_RIGHT', 'UTURN_RIGHT', 'UTURN_LEFT'],
    BranchType: [null, 'BRANCH_LEFT', 'BRANCH_RIGHT', 'HIGHWAY_IN_LEFT', 'HIGHWAY_IN_RIGHT', 'HIGHWAY_IN_STRAIGHT', 'HIGHWAY_OUT_LEFT', 'HIGHWAY_OUT_RIGHT',
        'HIGHWAY_OUT_STRAIGHT', 'FORK_LEFT', 'FORK_RIGHT', 'TRIPLE_FORK_LEFT', 'TRIPLE_FORK_RIGHT', 'TRIPLE_FORK_STRAIGHT', 'OVERPASS', 'UNDERPASS'],
    Side: [null, 'LEFT', 'RIGHT'],
    DestinationPosition: [null, 'LEFT', 'CENTER', 'RIGHT', 'NOT_DIGITIZED'],
    MainRoadDirection: ['LEFT', 'RIGHT'],
    VehicleTransportationType: ['FERRY', 'CAR_TRAIN'],
    AdditionalLaneInfo: ['NONE', 'ELLIPSIS', 'BUS', 'HOV', 'SCOOTER', 'BIKE', 'TOLL_ETC', 'TOLL_CASH', 'TOLL_ETC_CASH', 'BLOCKED'],
    LaneMarker: [null, 'SOLID', 'DASHED'],
    DistanceUnit: ['NONE', 'KM', 'MILE_UK', 'MILE_US', 'METER', 'YARD', 'FEET'],
    ProjectedModeGuidingProvider: ['NONE', 'CAR_PLAY', 'ANDROID_AUTO', 'CAR_LIFE', 'OTHER'],
    ManeuverGeometry: [null, 'TWO_WAY_FORK_TAKE_LEFT', 'TWO_WAY_FORK_TAKE_RIGHT', 'THREE_WAY_FORK_TAKE_LEFT', 'THREE_WAY_FORK_TAKE_CENTER',
        'THREE_WAY_FORK_TAKE_RIGHT', 'EXIT_LEFT_TAKE_LEFT', 'EXIT_LEFT_TAKE_RIGHT', 'EXIT_RIGHT_TAKE_LEFT', 'EXIT_RIGHT_TAKE_RIGHT',
        'EXIT_LEFT_TWO_WAY_FORK_TAKE_LEFT_LEFT', 'EXIT_LEFT_TWO_WAY_FORK_TAKE_LEFT_RIGHT', 'EXIT_RIGHT_TWO_WAY_FORK_TAKE_RIGHT_LEFT',
        'EXIT_RIGHT_TWO_WAY_FORK_TAKE_RIGHT_RIGHT', 'TWO_WAY_FORK_OVERPASS_LEFT_TAKE_LEFT', 'TWO_WAY_FORK_OVERPASS_LEFT_TAKE_RIGHT',
        'TWO_WAY_FORK_OVERPASS_RIGHT_TAKE_LEFT', 'TWO_WAY_FORK_OVERPASS_RIGHT_TAKE_RIGHT', 'TWO_WAY_FORK_UNDERPASS_LEFT_TAKE_LEFT',
        'TWO_WAY_FORK_UNDERPASS_LEFT_TAKE_RIGHT', 'TWO_WAY_FORK_UNDERPASS_RIGHT_TAKE_LEFT', 'TWO_WAY_FORK_UNDERPASS_RIGHT_TAKE_RIGHT',
        'TWO_WAY_FORK_OVERPASS_LEFT_UNDERPASS_RIGHT_TAKE_LEFT', 'TWO_WAY_FORK_OVERPASS_LEFT_UNDERPASS_RIGHT_TAKE_RIGHT',
        'TWO_WAY_FORK_UNDERPASS_LEFT_OVERPASS_RIGHT_TAKE_LEFT', 'TWO_WAY_FORK_UNDERPASS_LEFT_OVERPASS_RIGHT_TAKE_RIGHT',
        'THREE_WAY_FORK_OVERPASS_CENTER_TAKE_LEFT', 'THREE_WAY_FORK_OVERPASS_CENTER_TAKE_CENTER', 'THREE_WAY_FORK_OVERPASS_CENTER_TAKE_RIGHT',
        'THREE_WAY_FORK_UNDERPASS_CENTER_TAKE_LEFT', 'THREE_WAY_FORK_UNDERPASS_CENTER_TAKE_CENTER', 'THREE_WAY_FORK_UNDERPASS_CENTER_TAKE_RIGHT'],
};
/** An enum value as its catalog name, or null (not a name or number of that enum). */
function enumOf(type, v) {
    const names = ENUMS[type];
    if (typeof v === 'string') return names.indexOf(v) >= 0 ? v : null;
    if (typeof v === 'number' && v >= 0 && v < names.length && v === Math.floor(v)) return names[v];
    return null;
}

/** The union's kind and its body: { kind, body } for { intersection: {...} } (null / undefined members ignored). */
function unionOf(e) {
    if (!isObj(e)) return null;
    const keys = Object.keys(e).filter((k) => isObj(e[k]));
    if (keys.length !== 1) return null;
    return { kind: keys[0], body: e[keys[0]] };
}

/** The street (or exit) name: the description's text pieces joined. '' when none. */
function roadOf(b) {
    const els = b && b.description && Array.isArray(b.description.elements) ? b.description.elements : [];
    return els.map((x) => (x && typeof x.text === 'string' ? x.text : '')).filter((s) => s).join(' ').trim();
}

/** Text safe for one log line or the HUD's fonts: no control characters, any space as a plain one. */
function safeLog(t) { return String(t).replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, ' ').trim(); }
const FRACTIONS = { '\u00bd': '.5', '\u00bc': '.25', '\u00be': '.75' };
/**
 * formattedDistance as the car gives it: { dist: '450', unit: 'm', uk }; unit NONE (or unknown): no distance.
 * The text made safe: control characters out, odd spaces plain, fractions (\u00bd mi) as decimals, a unit the car
 * put in the text too ("0 m") taken out. uk: UK miles and yards (the "then" gap in yards, not feet).
 */
function distOf(b) {
    const f = b && b.formattedDistance, unitName = f ? enumOf('DistanceUnit', f.unit) : null;
    let d = f ? str(f.distance) : null;
    const u = unitName ? UNITS[unitName] : null;
    if (d !== null) {
        d = safeLog(d).replace(/^(\d*)([\u00bd\u00bc\u00be])/, (x, n, fr) => (n || '0') + FRACTIONS[fr]);
        if (u) d = d.replace(new RegExp('\\s*' + u + '$', 'i'), '').trim();
    }
    if (!d || !u || !/\d/.test(d)) return { dist: null, unit: null, uk: false };
    return { dist: d, unit: u, uk: unitName === 'MILE_UK' || unitName === 'YARD' };
}

/** About how far, in metres, from the car's own text ('0,5' km = 500 m); null if it can't be read. */
function metres(m) {
    if (!m || !m.dist || !m.unit) return null;
    // "1,234" and "1 234" (thousands) are 1234, "1,5" (a decimal comma) is 1.5
    const t = String(m.dist).trim(), v = parseFloat(/^\d{1,3}([, ]\d{3})+$/.test(t) ? t.replace(/[, ]/g, '') : t.replace(',', '.'));
    return isFinite(v) ? v * UNIT_M[m.unit] : null;
}

/*
 * Union members (GuidanceEventUnion, 22 in the car's catalog) that aren't a manoeuvre: skipped. Most aren't asked
 * for (eventQuery's includedTypes), but if one comes it mustn't hide the turn after it.
 */
const SKIP = { pointOfInterest: 1, laneGuiding: 1, trafficEvent: 1, trafficFlowItem: 1, routeSegmentItem: 1, placeholderElement: 1,
    tunnel: 1, border: 1, tollgate: 1, passiveManeuver: 1, speedLimitAssist: 1, speedLimit: 1, speedCamera: 1, speedSectionCamera: 1,
    dangerousCurve: 1, schoolZone: 1 };
/** detailedGeometry when it says something (not UNDEFINED / NONE / missing). */
function geomOf(b) { return enumOf('ManeuverGeometry', b.detailedGeometry); }


/**
 * One route event (an eventsInView item, or conclusiveDart.maneuver) as Redline's object, without t / src / lanes.
 * null for kinds that aren't a manoeuvre (lane rows, points of interest, empty).
 */
function decodeEvent(e) {
    const u = unionOf(e);
    if (!u) return null;
    const b = u.body, d = distOf(b);
    if (SKIP[u.kind]) return null;
    const dtd = Number(b.distanceToDestination);
    const m = { kind: null, dir: null, geom: null, exit: null, exitAngle: null, side: null, flag: null, stop: null, dist: d.dist, unit: d.unit, uk: d.uk, road: roadOf(b), unreliable: b.unreliable === true,
        dtd: isFinite(dtd) && dtd >= 0 ? dtd : null };
    switch (u.kind) {
    case 'intersection':
        m.kind = 'turn'; m.dir = enumOf('TurnDirection', b.direction) || 'NONE'; m.geom = geomOf(b);
        break;
    case 'branch':
        m.kind = 'branch'; m.dir = enumOf('BranchType', b.branchType) || 'NONE'; m.geom = geomOf(b);
        break;
    case 'roundabout': {
        m.kind = 'roundabout';
        const n = Number(b.exitNumber), a = Number(b.exitAngle);
        // UInt8 / UInt16 in the catalog: 255 / 65535-like values are "unknown", not exit 255 or a 15 degree angle
        m.exit = isFinite(n) && n > 0 && n < 100 ? Math.round(n) : null;
        m.exitAngle = isFinite(a) && a >= -360 && a <= 720 ? ((a % 360) + 360) % 360 : null;
        // driveDirection: the traffic side (LEFT: drive on the left, clockwise roundabouts; seen: LEFT on the drive, in
        // Australia, with a lane for right turns and U-turns). exitAngle: degrees clockwise from straight on (hud-nav.js)
        // missing or unknown: left (the only side seen on a car yet; the arrow still points at the exit's angle)
        m.side = enumOf('Side', b.driveDirection) === 'RIGHT' ? 'right' : 'left';
        break;
    }
    case 'alongMainRoad':
        m.kind = 'keep'; m.dir = enumOf('MainRoadDirection', b.mainRoadDirection) || 'NONE';
        break;
    case 'laneChange':
        m.kind = 'lanechange'; m.dir = enumOf('Side', b.changeSide) || 'NONE';
        break;
    case 'destinationManeuver':
        m.kind = 'destination'; m.dir = enumOf('DestinationPosition', b.position) || 'CENTER';
        // a stopover on the way: isCheckeredFlag false (the drive's destination: true)
        m.flag = b.isCheckeredFlag !== false;
        m.stop = isFinite(Number(b.stopOverNumber)) && Number(b.stopOverNumber) > 0 ? Math.round(Number(b.stopOverNumber)) : null;
        break;
    case 'vehicleTransportation':
        m.kind = 'transport'; m.dir = enumOf('VehicleTransportationType', b.type) || 'FERRY';
        break;
    default:
        // a kind newer than the catalog: shown as "follow the route" (a dot) if it has a distance, logged by kind
        if (!b.formattedDistance) return null;
        m.kind = 'follow'; m.dir = u.kind;
    }
    return m;
}

/**
 * A queryContent reply: { ok, error, events: [decoded...], raw: number of events }. ok false: an error reply or no
 * view (the turn isn't known; not the same as "no turns ahead").
 */
function decodeEvents(reply) {
    const out = { ok: false, error: null, events: [], raw: 0, uids: [] };
    if (!isObj(reply)) { out.error = 'no reply'; return out; }
    const err = reply.GuidanceEventListError;
    if (err !== undefined && err !== 'NO_ERROR' && err !== 0) { out.error = String(err); return out; }
    const v = Array.isArray(reply.viewContent) ? reply.viewContent[0] : null;
    const evs = v && Array.isArray(v.eventsInView) ? v.eventsInView : null;
    if (!evs) { out.error = 'no view'; return out; }
    out.ok = true; out.raw = evs.length;
    evs.forEach((e) => {
        const body = e && isObj(e.maneuver) ? e.maneuver : e, m = decodeEvent(body);
        // Ignore non-manoeuvre items, but retain an unreadable manoeuvre as a
        // barrier: a later turn must never be substituted for the next one.
        const kind = unionOf(body);
        if (!m && kind && SKIP[kind.kind]) return;
        // each event's uid (CarPlay numbers its turns 1, 2, 3...: an older turn has a smaller one), null without
        const u = unionOf(body), uid = u && u.body ? Number(u.body.uid) : NaN;
        out.events.push(m); out.uids.push(isFinite(uid) ? uid : null);
    });
    return out;
}

/** The kinds in a reply (the union keys), for the log. */
function kindsOf(reply) {
    const v = isObj(reply) && Array.isArray(reply.viewContent) ? reply.viewContent[0] : null;
    const evs = v && Array.isArray(v.eventsInView) ? v.eventsInView : [];
    return evs.map((e) => { const u = unionOf(e && isObj(e.maneuver) ? e.maneuver : e); return u ? u.kind : '?'; });
}

/** Guidance.conclusiveDart: its manoeuvre, or null (CarPlay leaves it at an empty pointOfInterest). */
function decodeDart(v) {
    return isObj(v) && isObj(v.maneuver) ? decodeEvent(v.maneuver) : null;
}


module.exports={decodeDart,decodeEvents};
