//=============================================================================
// CSX Event Spawner
// by RiA
// Date: 2022/10/14
//=============================================================================
/*:
* @target MZ
* @plugindesc Spawns events in a region
* @author RiA
*
* @help CsxEventSpawner.js
*
* This plugin makes multiple copies of an event
* from a source map to the current map.
*
* @command spawn
* @text Spawn Events
* @desc Spawns events in a region
* @default None
*
* @arg sourceMapId
* @type number
* @default 1
* @text Source Map ID
* @desc Map from where the event will be copied
*
* @arg sourceEventId
* @type number
* @default 1
* @text Source Event ID
* @desc The event that will be copied
*
* @arg eventCount
* @type number
* @default 1
* @text Event Count
* @desc No of events to spawn
*
* @arg targetRegionId
* @type number
* @default 1
* @text Target Region ID
* @desc Region where the events will spawn
*/


// Commands register
(() => {
    PluginManager.registerCommand('CsxEventSpawner', 'spawn', args => {
        CSX.EventSpawner.spawnEvents(
            Number(args.sourceMapId),
            Number(args.sourceEventId),
            Number(args.eventCount),
            Number(args.targetRegionId));
    });
})();


// Plugin namespace and storage
// ========================================================================= //
// ========================================================================= //
var CSX = CSX ?? {};
CSX.EventSpawner = CSX.EventSpawner ?? {};
CSX.EventSpawner.temporaryEvents = CSX.EventSpawner.temporaryEvents ?? [];
CSX.EventSpawner.sourceEvents = CSX.EventSpawner.sourceEvents ?? [];
// Handle plugin command : "spawn"
CSX.EventSpawner.spawnEvents = function (sourceMapId, sourceEventId, eventCount, targetRegionId) {
    // Get spawn points
    const ids = this.getAvailableEventIds(eventCount);
    const tiles = this.getSpawnableTiles(targetRegionId);
    const spawnPoints = this.designateSpawnPoints(ids, tiles);
    // Generate spawn infos and store them
    spawnPoints.forEach(x =>
        this.setupSpawnInfo(x.id, x.x, x.y, sourceMapId, sourceEventId));
    // Setup event runtimes
    spawnPoints.forEach(x => this.initializeEvent(x.id));
};


// Storage
// ========================================================================= //
// Get Event Data (Cache it, or fetch it)
CSX.EventSpawner.getTemporaryEvents = function() {
    const mapId = $gameMap.mapId();
    this.temporaryEvents[mapId] = this.temporaryEvents[mapId] ?? [];
    return this.temporaryEvents[mapId];
};
CSX.EventSpawner.getEventData = function (eventId) {
    const spawnInfo = this.getTemporaryEvents()[eventId];
    let eventData = spawnInfo.eventData;
    // If it doesn't exist, generate it
    if (!eventData) {
        eventData = JSON.parse(this.getSourceEventJson(spawnInfo.sourceMapId, spawnInfo.sourceEventId));
        eventData.id = spawnInfo.spawnId;
        eventData.x = spawnInfo.spawnX;
        eventData.y = spawnInfo.spawnY;
        spawnInfo.eventData = eventData;
    }
    return eventData;
};
// Store Spawn Info
CSX.EventSpawner.storeSpawnInfo = function (spawnInfo) {
    this.getTemporaryEvents()[spawnInfo.spawnId] = spawnInfo;
};
// Get Source Events (Cache it, or fetch it)
CSX.EventSpawner.getSourceEventJson = function (sourceMapId, sourceEventId) {
    let eventJson = this.sourceEvents[[sourceMapId, sourceEventId]];
    if (!eventJson) {
        eventJson = this.downloadEventJson(sourceMapId, sourceEventId);
        this.sourceEvents[[sourceMapId, sourceEventId]] = eventJson;
    }
    return eventJson;
};
CSX.EventSpawner.downloadEventJson = function (sourceMapId, sourceEventId) {
    const ajax = new XMLHttpRequest();
    const file = "Map%1.json".format(sourceMapId.padZero(3));
    const url = "data/" + file;
    ajax.open("GET", url, false);
    ajax.send();
    var mapData = JSON.parse(ajax.responseText);
    return JSON.stringify(mapData.events[sourceEventId]);
};


// Available Tiles and Event IDs
// ======================================================================== //
// Designate spawn points
CSX.EventSpawner.designateSpawnPoints = function (ids, tiles) {
    const spawnTiles = this.randomizeSpawnTiles(ids.length, tiles);
    const spawnPoints = [];
    for (let i = 0; i < spawnTiles.length; i++) {
        spawnPoints.push({
            id: ids[i],
            x: spawnTiles[i].x,
            y: spawnTiles[i].y
        });
    }
    return spawnPoints;
};
// Randomly pick spawn tiles from the given array
CSX.EventSpawner.randomizeSpawnTiles = function (count, tiles) {
    // Route : too few available tiles
    if (count >= tiles.length)
        return tiles;
    // Route : determine route to optimize randomization steps
    let iCount = count;
    let useExclusion = tiles.length < count * 2;
    if (useExclusion)
        iCount = tiles.length - count;
    // generate relevant array
    const prototypedPoints = [];
    for (let i = 0; i < iCount; i++) {
        var tile = null;
        while (prototypedPoints.contains(tile) || !tile) {
            tile = tiles[Math.floor(Math.random() * tiles.length)];
        }
        prototypedPoints.push(tile);
    }
    // Route : Exclusion
    if (!useExclusion)
        return prototypedPoints;
    // Route : Inclusion
    let spawnTiles = [];
    tiles.forEach(x => {
        if (!prototypedPoints.contains(x))
            spawnTiles.push(x);
    });
    return spawnTiles;
};
// Get an array of available tiles where events can spawn on
CSX.EventSpawner.getSpawnableTiles = function (regionId) {
    const mapWidth = $gameMap.width();
    const mapHeight = $gameMap.height();
    const tiles = [];
    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            // Validations: Passable, Region, Overlaps: Player, Event, Vehicles
            if (!$gameMap.isPassable(x, y)) continue;
            if ($gameMap.regionId(x, y) != regionId) continue;
            if ($gamePlayer.x == x && $gamePlayer.y == y) continue;
            if ($gameMap.eventsXy(x, y).length > 0) continue;
            if (Game_CharacterBase.prototype.isCollidedWithVehicles(x, y)) continue;

            tiles.push(new Object({ x: x, y: y }));
        }
    }
    return tiles;
};
// Get Available Event Ids
CSX.EventSpawner.getAvailableEventIds = function (count) {
    let existing = [];
    $dataMap.events.forEach(x => {
        if(x)
            existing.push(x.id)
    });
    this.getTemporaryEvents().forEach(x => {
        if(x)
            existing.push(x.spawnId);
    });
    let results = [];
    for (let n = 0; n < count; n++) {
        let i = 1;
        while (existing.contains(i) || results.contains(i))
            i++;
        results.push(i);
    }
    return results;
};


// Generate
// ========================================================================= //
// Generate spawn info and cache it
CSX.EventSpawner.setupSpawnInfo = function (spawnId, spawnX, spawnY, sourceMapId, sourceEventId) {
    const spawnInfo = new Spawn_Info(spawnId);
    spawnInfo.spawnX = spawnX;
    spawnInfo.spawnY = spawnY;
    spawnInfo.sourceMapId = sourceMapId;
    spawnInfo.sourceEventId = sourceEventId;
    spawnInfo.randomizeDirection();
    // Store it
    this.storeSpawnInfo(spawnInfo);
};
// Update events (maybe make functions that the game calls instead of manually starting the lifetime)
CSX.EventSpawner.initializeEvent = function (eventId) {
    // create runtime
    var gameEvent = new Game_Event($gameMap.mapId(), eventId);
    $gameMap._events[eventId] = gameEvent;
    // apply direction
    gameEvent.setDirection(this.getTemporaryEvents()[eventId].spawnDirection);
    // initialize sprite
    var sprite = new Sprite_Character(gameEvent);
    SceneManager._scene._spriteset._characterSprites.push(sprite);
    SceneManager._scene._spriteset._tilemap.addChild(sprite);
};


// Plugin Objects : SpawnInfo
// ========================================================================= //
// ========================================================================= //
class Spawn_Info {
    constructor(eventId) {
        this.spawnId = eventId;
    };
    spawnId = 1;
    spawnX = 0;
    spawnY = 0;
    spawnDirection = 2;
    sourceMapId = 1;
    sourceEventId = 1;
    eventData = null;
    randomizeDirection() {
        this.spawnDirection = 2 * Math.floor(Math.random() * 4) + 2;
    };
};


// Core functionality detours
// ========================================================================= //
// ========================================================================= //
// Source from eventDataCache along with existing $dataMap.events
CSX.EventSpawner.detour = CSX.EventSpawner.detour || {};
CSX.EventSpawner.detour.Game_Event__event$ = Game_Event.prototype.event;
Game_Event.prototype.event = function () {
    return CSX.EventSpawner.detour.Game_Event__event$.call(this)
        ?? CSX.EventSpawner.getEventData(this._eventId);
};
// Clear obsolete events
CSX.EventSpawner.detour.Game_Map__setup = Game_Map.prototype.setup;
Game_Map.prototype.setup = function (mapId) {
    // clear obsolete events
    for (let i = 0; i < CSX.EventSpawner.temporaryEvents.length; i++) {
        if (i != mapId)
            CSX.EventSpawner.temporaryEvents[i] = undefined;
    }
    // original function call
    CSX.EventSpawner.detour.Game_Map__setup.call(this, mapId);
};
// No need to override Game_Map.prototype.setupEvents
// since that's before temp events are assigned