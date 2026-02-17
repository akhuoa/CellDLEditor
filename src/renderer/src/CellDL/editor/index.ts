/******************************************************************************

CellDL Editor

Copyright (c) 2022 - 2025 David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

******************************************************************************/
/** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */

import * as vue from 'vue'
import { useTippy } from "vue-tippy"

import '@renderer/assets/svgContent.css'

import type { CellDLObject } from '@editor/celldlObjects/index'
import { PathMaker, type PathNode } from '@editor/connections/pathmaker'
import type { TemplateEventDetails } from '@editor/components/index'
import { ObjectPropertiesPanel } from '@editor/components/properties'
import type { CellDLDiagram } from '@editor/diagram/index'
import { componentLibraryPlugin } from '@renderer/plugins/index'
import { round } from '@editor/utils'

import { type PointLike, PointMath } from '@renderer/common/points'
import type { StringProperties } from '@renderer/common/types'

//==============================================================================

import { EditorFrame } from '@editor/editor/editorframe'
import { editGuides, EDITOR_GRID_CLASS } from '@editor/editor/editguides'
import PanZoom from '@editor/editor/panzoom'
import { SelectionBox } from '@editor/editor/selectionbox'
import { undoRedo } from '@editor/editor/undoredo'

//==============================================================================

/****  WIP
const SVG_CLOSE_DISTANCE = 2   // Pointer is close to object in SVG coords
                               // c.f. stroke-width (for connections)??
WIP ****/

//==============================================================================

const MAX_POINTER_CLICK_TIME = 200 // milliseconds

//==============================================================================

// Lookup tables for tracking tool bar state

export enum EDITOR_TOOL_IDS {
    SelectTool = 'select-tool',
    DrawConnectionTool = 'draw-connection-tool',
    AddComponentTool = 'add-component-tool'
}

export const DEFAULT_EDITOR_TOOL_ID = EDITOR_TOOL_IDS.SelectTool

enum EDITOR_STATE {
    Selecting = 'SELECTING',
    DrawPath = 'DRAW-PATH',
    AddComponent = 'ADD-COMPONENT'
}

const TOOL_TO_STATE: Map<EDITOR_TOOL_IDS, EDITOR_STATE> = new Map([
    [EDITOR_TOOL_IDS.SelectTool, EDITOR_STATE.Selecting],
    [EDITOR_TOOL_IDS.DrawConnectionTool, EDITOR_STATE.DrawPath],
    [EDITOR_TOOL_IDS.AddComponentTool, EDITOR_STATE.AddComponent]
])

const DEFAULT_EDITOR_STATE = TOOL_TO_STATE.get(DEFAULT_EDITOR_TOOL_ID)!

//==============================================================================

export enum PANEL_IDS {
    PropertyPanel = 'property-panel'
}

//==============================================================================

export enum CONTEXT_MENU {
    DELETE = 'menu-delete',
    EDIT_GROUP = 'menu-edit-group',
    INFO = 'menu-info',
    GROUP_OBJECTS = 'menu-group',
    UNGROUP_OBJECTS = 'menu-ungroup'
}
//==============================================================================

export function notifyChanges() {
    document.dispatchEvent(new CustomEvent('file-edited'))
}

//==============================================================================

export function getElementId(element: SVGGraphicsElement): string {
    return element.dataset.parentId
        ? element.dataset.parentId
        : element.classList.contains('parent-id')
          ? element.parentElement?.id || ''
          : element.id
}

//==============================================================================

const SVG_PANEL_ID = 'svg-panel'

export class CellDLEditor {
    static instance: CellDLEditor | null = null

    #container: HTMLElement | null = null
    #statusMsg: HTMLElement | null = null
    #statusPos: HTMLElement | null = null
    #statusStyle: string = ''

    #celldlDiagram: CellDLDiagram | null = null
    #svgDiagram: SVGSVGElement | null = null
    #editorFrame: EditorFrame | null = null

    #panning: boolean = false
    #panzoom: PanZoom | null = null
    #pointerMoved: boolean = false
    #pointerPosition: DOMPoint | null = null
    #moving: boolean = false
    #moved: boolean = false

    #editorState: EDITOR_STATE = DEFAULT_EDITOR_STATE
    #activeObject: CellDLObject | null = null
    #dirty: boolean = false

    #dragging: boolean = false
    #haveFocus: boolean = true

    #pathMaker: PathMaker | null = null
    #nextPathNode: PathNode | null = null

//    #contextMenu: ContextMenu

    #currentTemplateDetails: TemplateEventDetails | null = null
    #drawConnectionSettings: StringProperties = {}

    #selectedObject: CellDLObject | null = null
    #selectionBox: SelectionBox | null = null
    #newSelectionBox: boolean = false

    #pointerDownTime: number = 0

    #openPanelId: PANEL_IDS | null = null
    #propertiesPanel: ObjectPropertiesPanel = new ObjectPropertiesPanel()

    #tooltip: vue.Ref|undefined
    #tooltipElement: HTMLElement|undefined
    #tooltipStyle: string = ''

    constructor() {
        CellDLEditor.instance = this

        /**
        this.#contextMenu = this.getElementById('context-menu') as ContextMenu
        this.status = 'new editor'
**/
        // Add a handler for events from toolbar buttons
        document.addEventListener('toolbar-event', this.#toolBarEvent.bind(this))
        document.addEventListener('component-selected', this.#componentTemplateSelectedEvent.bind(this))
        document.addEventListener('component-drag', this.#componentTemplateDragEvent.bind(this))

        // Add handler for events from panels
        document.addEventListener('panel-event', this.#panelEvent.bind(this))
        document.addEventListener('style-event', this.#styleEvent.bind(this))

        // Handle click events on control points
        document.addEventListener('select-object', this.#objectClickEvent.bind(this))
    }

    mount(svgContainer: HTMLElement) {
        this.#container = svgContainer
        this.#statusMsg = document.getElementById('status-msg')
        this.#statusPos = document.getElementById('status-pos')

        // Create a panzoom handler
        this.#panzoom = new PanZoom(this.#container)

        // Set up event handlers
        this.#container.addEventListener('click', this.#pointerClickEvent.bind(this))
        this.#container.addEventListener('dblclick', this.#pointerDoubleClickEvent.bind(this))

        this.#container.addEventListener('pointerover', this.#pointerOverEvent.bind(this))
        this.#container.addEventListener('pointerout', this.#pointerOutEvent.bind(this))

        this.#container.addEventListener('pointerdown', this.#pointerDownEvent.bind(this))
        this.#container.addEventListener('pointermove', this.#pointerMoveEvent.bind(this))
        this.#container.addEventListener('pointerup', this.#pointerUpEvent.bind(this))

        // Editor content focus handlers
        document.addEventListener('focusin', this.#focusEvent.bind(this))
        document.addEventListener('focusout', this.#focusEvent.bind(this))

        // Keyboard handlers
        window.addEventListener('keydown', this.#keyDownEvent.bind(this))
        window.addEventListener('keyup', this.#keyUpEvent.bind(this))

        // Add handlers for dropping components on the canvas
        this.#container.addEventListener('dragover', this.#appDragOverEvent.bind(this))
        this.#container.addEventListener('drop', this.#appDropEvent.bind(this))

        // Create a tooltip

        const { tippy } = useTippy(this.#container, {
            content: '',
            animation: 'none',
            duration: [0, 0],
            showOnCreate: false,
            hideOnClick: false,
            trigger: 'manual',
            arrow: true,
            followCursor: true
        })
        if (tippy.value) {
            this.#tooltip = tippy
            this.#tooltipElement = this.#tooltip.value.popper
        }
/**

        // Handle context menu events
        this.#container.addEventListener('contextmenu', (event) => {
            const element = event.target as SVGGraphicsElement
            const clickedObject = this.#celldlDiagram!.objectById(getElementId(element))
            if (clickedObject && clickedObject === this.#activeObject) {
                this.#setSelectedObject(clickedObject)
            }
            this.#contextMenu.open(event.clientX, event.clientY)
        })

        this.#contextMenu.setListener((event: Event) => {
            const targetId = 'target' in event && event.target && 'id' in event.target ? event.target.id : null
            if (targetId === CONTEXT_MENU.DELETE) {
                this.#deleteSelectedObjects()
            } else if (targetId === CONTEXT_MENU.INFO) {
                this.#showSelectedObjectInfo()
            } else if (targetId === CONTEXT_MENU.GROUP_OBJECTS) {
                if (this.#selectionBox) {
                    this.#selectionBox.makeCompartment()
                    this.#closeSelectionBox()
                }
            }
            this.#contextMenu.close()
        })
**/
    }

    get celldlDiagram() {
        return this.#celldlDiagram
    }

    get dirty() {
        return this.#dirty
    }

    get editorFrame() {
        return this.#editorFrame
    }

    get status(): string {
        return this.#statusMsg ? this.#statusMsg.innerText : ''
    }
    set status(text: string) {
        this.showMessage(text)
    }

    get windowSize(): [number, number] {
        if (this.#container) {
            return [this.#container.clientWidth, this.#container.clientHeight]
        }
        return [0, 0]
    }

    setDirty() {
        if (!this.#dirty) {
            this.#dirty = true
        }
    }

    markClean() {
        if (this.#dirty) {
            this.#dirty = false
        }
    }

    async editDiagram(celldlDiagram: CellDLDiagram) {
        if (this.#celldlDiagram !== null) {
            this.closeDiagram()
        }
        this.#celldlDiagram = celldlDiagram
        this.#svgDiagram = celldlDiagram.svgDiagram

        // Make sure we have a group in which to put selection related objects
        // This MUST remain as the last group in the diagram when new layer groups are added...
        this.#editorFrame = new EditorFrame(this.#svgDiagram!)

        // Note the selection group's element so that it's not saved
        celldlDiagram.addEditorElement(this.#editorFrame.svgGroup!)

        // Initialise alignment guides and grid
        editGuides.newDiagram(celldlDiagram, true)

        // Show the diagram in the editor's window
        if (this.#container) {
            this.#container.appendChild(this.#svgDiagram!)
        }

        // Allow for the diagram to render
        await vue.nextTick()

        // Rewriting metadata during diagram finishSetup might dirty
        this.markClean()
        undoRedo.clean()

        // Finish setting up the diagram as we now have SVG elements
        celldlDiagram.finishSetup()

        // Enable pan/zoom and toolBars
        this.#panzoom!.enable(this.#svgDiagram!)

        // Set initial state
        this.#editorState = EDITOR_STATE.Selecting
        this.#activeObject = null
        this.#pointerMoved = false
        this.#selectedObject = null
        this.#propertiesPanel.clearObjectProperties()
    }

    closeDiagram() {
        if (this.#celldlDiagram !== null) {
            this.#editorFrame!.clear()
            this.#editorFrame = null
            //            this.#toolBar.enable(false)
            this.#panzoom!.disable()
            if (this.#container) {
                this.#container.removeChild(this.#svgDiagram as Node)
            }
            this.#svgDiagram = null
            this.#celldlDiagram = null
        }
    }

    resetObjectStates() {
        this.#unsetSelectedObject()
        this.#unsetActiveObject()
    }

    #setDefaultCursor() {
        if (this.#editorState === EDITOR_STATE.DrawPath) {
            this.#svgDiagram?.style.setProperty('cursor', 'crosshair')
        } else {
            this.#svgDiagram?.style.removeProperty('cursor')
        }
        if (this.#container) {
            this.#container.style.setProperty('cursor', 'default')
        }
    }

    enableContextMenuItem(_itemId: string, _enable: boolean = true) {
//        this.#contextMenu.enableItem(itemId, enable)
    }

    #toolBarEvent(event: Event) {
        const detail = (<CustomEvent>event).detail

        if (detail.type === 'state') {
            if (Object.values(PANEL_IDS).includes(detail.source)) {
                this.#openPanelId = detail.value ? detail.source : null
            } else if (detail.value && TOOL_TO_STATE.has(detail.source as EDITOR_TOOL_IDS)) {
                this.#editorState = TOOL_TO_STATE.get(detail.source as EDITOR_TOOL_IDS)!
                this.#setDefaultCursor()
                if (this.#editorState !== EDITOR_STATE.Selecting) {
                    this.#unsetSelectedObject()
                    this.#closeSelectionBox()
                }
                if (this.#editorState !== EDITOR_STATE.DrawPath) {
                    // Remove any partial path from editor frame...
                    if (this.#pathMaker) {
                        this.#pathMaker.close()
                        this.#pathMaker = null
                    }
                }
            }
        } else if (detail.type === 'value') {
            if (detail.source === EDITOR_TOOL_IDS.DrawConnectionTool) {
                this.#drawConnectionSettings = {
                    style: detail.value
                }
            }
        }
    }

    async #panelEvent(event: Event) {
        const detail = (<CustomEvent>event).detail
        if (detail.source === this.#openPanelId) {
            if (this.#selectedObject && this.#openPanelId === PANEL_IDS.PropertyPanel) {
                const values = detail.value
                if (values.oldValue !== values.newValue) {
                    await this.#propertiesPanel.updateObjectProperties(this.#selectedObject, detail.itemId, detail.value,
                                                                       this.#celldlDiagram!.rdfStore)
                    notifyChanges()
                }
            }
        }
    }

    async #styleEvent(event: Event) {
        const detail = (<CustomEvent>event).detail
        if (detail.source === this.#openPanelId) {
            if (this.#openPanelId === PANEL_IDS.PropertyPanel) {
                await this.#propertiesPanel.updateObjectStyling(this.#selectedObject, detail.object, detail.styling)
                notifyChanges()
            }
        }
    }

    showMessage(msg: string, style: string = '') {
        if (this.#statusMsg) {
            this.#statusMsg.innerText = msg
            if (this.#statusStyle !== '') {
                this.#statusMsg.classList.remove(this.#statusStyle)
            }
            if (style !== '') {
                this.#statusMsg.classList.add(style)
                this.#statusStyle = style
            }
        }
    }

    #showStatus(pos: PointLike|null) {
        if (pos === null) {
            this.status = ''
            if (this.#statusPos) {
                const text = this.#statusPos.innerText
                if (!text.startsWith('(')) {
                    if (text.includes('(')) {
                        const parts = text.split('(')
                        this.#statusPos.innerText = `(${parts.slice(1).join('(')}`
                    } else {
                        this.#statusPos.innerText = ''
                    }
                }
            }
        } else {
            const position = `(${round(pos.x, 1)}, ${round(pos.y, 1)})`
            if (this.#activeObject) {
                this.status = this.#activeObject.name ?? ''
                if (this.#statusPos) {
                    this.#statusPos.innerText = `${this.#activeObject.id} ${position}`
                }
            } else {
                this.status = ''
                if (this.#statusPos) {
                    this.#statusPos.innerText = position
                }
            }
        }
    }

    #hideTooltip() {
        if (this.#tooltip) {
            this.#tooltip.value.hide()
        }
    }

    showTooltip(msg: string, style: string = '') {
        if (msg === '') {
            this.#hideTooltip()
        } else if (this.#tooltip) {
            this.#tooltip.value.setContent(msg)
            this.#tooltip.value.show()
            if (this.#tooltipElement) {
                if (this.#tooltipStyle !== '') {
                    this.#tooltipElement.classList.remove(this.#tooltipStyle)
                    this.#tooltipStyle = ''
                }
                if (style !== '') {
                    const tooltipStyle = `tooltip-${style}`
                    this.#tooltipElement.classList.add(tooltipStyle)
                    this.#tooltipStyle = tooltipStyle
                }
            }
        }
    }

    #domToSvgCoords(domCoords: PointLike): DOMPoint {
        return this.#celldlDiagram!.domToSvgCoords(domCoords)
    }

    #highlightAssociatedObjects(object: CellDLObject, highlight: boolean) {
        for (const obj of this.#celldlDiagram!.associatedObjects(object)) {
            obj.highlight(highlight)
        }
    }

    #activateObject(object: CellDLObject, active: boolean) {
        object.activate(active)
        if (object.isConnection) {
            this.#highlightAssociatedObjects(object, active)
        }
    }

    #setActiveObject(activeObject: CellDLObject | null) {
        if (activeObject && this.#activeObject !== activeObject) {
            activeObject.drawControlHandles()
            this.#activateObject(activeObject, true)
            this.#activeObject = activeObject
        }
    }

    #unsetActiveObject() {
        if (this.#activeObject) {
            this.#activeObject.clearControlHandles()
            this.#activateObject(this.#activeObject, false)
            this.#activeObject = null
        }
    }

    #setSelectedObject(selectedObject: CellDLObject) {
        this.#unsetSelectedObject() // This will depend upon multi-selection
        if (selectedObject !== null) {
            selectedObject.select(true)
            selectedObject.drawControlHandles()
            this.#selectedObject = selectedObject
            this.#propertiesPanel.setObjectProperties(selectedObject, this.#celldlDiagram!.rdfStore)
            this.enableContextMenuItem(CONTEXT_MENU.DELETE, true)
            this.enableContextMenuItem(CONTEXT_MENU.INFO, true)
        }
    }

    #unsetSelectedObject() {
        if (this.#selectedObject) {
            this.#selectedObject.select(false)
            this.#selectedObject.clearControlHandles()
            this.#selectedObject = null
            this.#propertiesPanel.setObjectProperties(null, this.#celldlDiagram!.rdfStore)
            this.enableContextMenuItem(CONTEXT_MENU.DELETE, false)
            this.enableContextMenuItem(CONTEXT_MENU.INFO, false)
        }
    }

    #componentTemplateDragEvent(_event: Event) {
        this.#dragging = true
    }

    #appDragOverEvent(event: DragEvent) {
        if (this.#dragging && event.dataTransfer) {
            event.preventDefault() // Needed to allow drop
            event.dataTransfer.dropEffect = 'copy'
        }
    }

    #componentTemplateSelectedEvent(event: Event) {
        this.#currentTemplateDetails = (<CustomEvent>event).detail
    }

    #addComponentTemplate(eventPosition: PointLike, details: TemplateEventDetails, dragged=false) {
        // Adjust position by offset at component selection
        const zoomScale = this.#panzoom?.scale || 1
        let topLeft = PointMath.subtract(eventPosition, PointMath.scalarScale(details.centre, zoomScale))
        if (dragged) {
            topLeft = topLeft.subtract(PointMath.scalarScale(details.offset, zoomScale))
        }
        const template = componentLibraryPlugin.getObjectTemplateById(details.id)
        if (!template) {
            console.error(`Drop of unknown component template '${details.id}'`)
            return
        }
        const componentGroup = this.#editorFrame!.addSvgElement(template, this.#domToSvgCoords(topLeft))
        const celldlObject = this.#celldlDiagram!.addConnectedObject(componentGroup, template)
        if (celldlObject) {
            this.#setActiveObject(celldlObject)
            this.#setSelectedObject(celldlObject)
            this.#showStatus(eventPosition)
        }
    }

    #appDropEvent(event: DragEvent) {
        this.#dragging = false
        event.preventDefault();
        if (event.dataTransfer) {
            const itemList = event.dataTransfer!.items
            for (let index = 0; index < itemList.length; ++index) {
                const item = itemList[index]
                if (item.kind === "string" && item.type.match("^text/plain")) {
                    item.getAsString((s: string) => {
                        this.#addComponentTemplate(event, JSON.parse(s), true)
                    })
                }
            }
        }
    }

    #objectClickEvent(event: Event) {
        const detail = (<CustomEvent>event).detail
        const clickedObject: CellDLObject = detail.clickedObject
        this.#selectionClickEvent(detail.event, clickedObject.svgElement!, clickedObject)
    }

    #pointerClickEvent(event: MouseEvent) {
        const element = event.target as SVGGraphicsElement
        if (
            this.#celldlDiagram === null ||
            !this.#svgDiagram?.contains(element) ||
            // clickTolerance = 1px ? to set pointerMoved?
            (this.#pointerMoved && Date.now() - this.#pointerDownTime > MAX_POINTER_CLICK_TIME)
        ) {
            return
        }
        const clickedObject = this.#celldlDiagram.objectById(getElementId(element))
        if (this.#editorState === EDITOR_STATE.AddComponent && clickedObject === null) {
            if (this.#currentTemplateDetails) {
                this.#addComponentTemplate(event, this.#currentTemplateDetails)
            }
            return
        }
        this.#selectionClickEvent(event, element, clickedObject)
    }

    #selectionClickEvent(event: MouseEvent, _element: SVGGraphicsElement, clickedObject: CellDLObject|null) {
        let deselected = false
        if (this.#selectedObject !== null) {
            // Deselect
            deselected = clickedObject === this.#selectedObject
            this.#unsetSelectedObject()
        }
        if (this.#editorState === EDITOR_STATE.DrawPath) {
            if (this.#pathMaker) {
                if (this.#activeObject === null) {
                    const svgPoint = this.#domToSvgCoords(event)
                    this.#pathMaker.addPoint(svgPoint, event.shiftKey)
                }
            }
        } else {
            if (!deselected && clickedObject && clickedObject === this.#activeObject) {
                // Select when active object is clicked
                this.#setSelectedObject(clickedObject)
            }
        }
    }

    #pointerDoubleClickEvent(event: MouseEvent) {
        if (this.#editorState === EDITOR_STATE.DrawPath) {
            if (this.#pathMaker) {
                if (this.#activeObject === null) {
                    this.#pathMaker.finishPartialPath(this.#celldlDiagram!, event.shiftKey)
                    this.#pathMaker = null
                }
            } else {
                this.#nextPathNode = PathMaker.startPartialPath(this.#domToSvgCoords(event), this.#celldlDiagram!)
                if (this.#nextPathNode != null) {
                    const settings = this.#drawConnectionSettings // settings.type is to come from object's domain...
                    this.#pathMaker = new PathMaker(this.#editorFrame!, this.#nextPathNode, settings.style)
                }
            }
        }
    }

    #notDiagramElement(element: SVGGraphicsElement) {
        return (
            element === this.#svgDiagram ||
            element.id === SVG_PANEL_ID ||
            element.classList.contains(EDITOR_GRID_CLASS) ||
            !this.#svgDiagram?.contains(element)
        )
    }

    #pointerOverEvent(event: PointerEvent) {
        if (this.#celldlDiagram === null) {
            return
        }
        const element = event.target as SVGGraphicsElement
        const currentObject = this.#celldlDiagram.objectById(getElementId(element))

        if (this.#moving) {
            // A move finishes with pointer up
            return
        } else if (this.#notDiagramElement(element)) {
            this.#hideTooltip()
            if (this.#activeObject && currentObject !== this.#activeObject) {
                this.#unsetActiveObject()
            }
            return
        } else if (this.#selectionBox?.pointerEvent(event, this.#domToSvgCoords(event))) {
            return
        }

        if (this.#editorState === EDITOR_STATE.DrawPath) {
            if (
                this.#activeObject &&
                currentObject !== this.#activeObject &&
                (currentObject !== null || (this.#pathMaker && element !== this.#pathMaker.currentSvgPath))
            ) {
                this.#unsetActiveObject()
            }
            if (currentObject) {
                element.style.removeProperty('cursor')
                // Set object active regardless of whether it's valid for the path
                this.#setActiveObject(currentObject)
                if (this.#pathMaker === null) {
                    this.#nextPathNode = PathMaker.validStartObject(currentObject)
                } else {
                    this.#nextPathNode = this.#pathMaker.validPathNode(currentObject)
                }
            }
        } else {
            if (this.#activeObject && currentObject !== this.#activeObject) {
                this.#unsetActiveObject()
            }
            if (currentObject) {
                this.#setActiveObject(currentObject)
                currentObject.initialiseMove(element)
            }
        }
    }

    #pointerOutEvent(event: PointerEvent) {
        const element = event.target as SVGGraphicsElement
        if (
            element === this.#svgDiagram ||
            element.classList.contains(EDITOR_GRID_CLASS) ||
            !this.#svgDiagram?.contains(element)
        ) {
            if (this.#activeObject && !this.#moving) {
                this.#activeObject.finaliseMove()
                this.#unsetActiveObject()
            }
        } else if (this.#editorState === EDITOR_STATE.DrawPath) {
            if (this.#pathMaker === null) {
                this.#unsetActiveObject()
            }
        }
    }

    #pointerDownEvent(event: PointerEvent) {
        this.#pointerMoved = false
        this.#pointerDownTime = Date.now()
        const element = event.target as SVGGraphicsElement
        if (event.button === 2 || (!event.shiftKey && this.#notDiagramElement(element))) {
            this.#svgDiagram?.style.removeProperty('cursor')
            this.#container?.style.setProperty('cursor', 'grab')
            this.#panzoom!.pointerDown(event)
            this.#panning = true
            return
        }
        const svgPoint = this.#domToSvgCoords(event)
        if (this.#editorState === EDITOR_STATE.DrawPath) {
            if (this.#activeObject && this.#nextPathNode) {
                if (this.#pathMaker === null) {
                    const settings = this.#drawConnectionSettings // settings.type is to come from object's domain...
                    this.#pathMaker = new PathMaker(this.#editorFrame!, this.#nextPathNode, settings.style)
                } else if (!this.#pathMaker.empty) {
                    if (this.#activeObject.isConduit) {
                        this.#pathMaker.addIntermediate(this.#nextPathNode, event.shiftKey)
                    } else {
                        this.#pathMaker.finishPath(this.#nextPathNode, this.#celldlDiagram!, event.shiftKey)
                        this.#pathMaker = null
                    }
                }
            }
        } else if (this.#activeObject?.moveable) {
            // EDITOR_STATE.Selecting or EDITOR_STATE.AddComponent
            this.#activeObject.startMove(svgPoint)
            this.#moving = true
            this.#moved = false
        } else if (this.#editorState === EDITOR_STATE.Selecting) {
            if (this.#selectionBox) {
                this.#selectionBox.pointerEvent(event, svgPoint)
            } else if (event.shiftKey) {
                this.#unsetSelectedObject()
                this.#selectionBox = new SelectionBox(this, svgPoint)
                this.#newSelectionBox = true
            }
        }
    }

    #pointerMoveEvent(event: PointerEvent) {
        if (this.#panning) {
            this.#pointerMoved = this.#panzoom!.pointerMove(event) || this.#pointerMoved
            return
        }
        this.#pointerMoved = true
        this.#pointerPosition = new DOMPoint(event.x, event.y)
        const svgPoint = this.#domToSvgCoords(event)
        this.#showStatus(svgPoint)
        if (this.#editorState === EDITOR_STATE.DrawPath) {
            if (this.#pathMaker) {
                this.#pathMaker.drawTo(svgPoint, event.shiftKey)
            }
        } else if (this.#activeObject && this.#moving) {
            // EDITOR_STATE.Selecting or EDITOR_STATE.AddComponent
            this.#moved = true
            this.#activeObject!.move(svgPoint)
            this.#celldlDiagram!.objectMoved(this.#activeObject!)
            if (this.#selectionBox) {
                this.#selectionBox.updateSelectedObjects()
            }
        } else if (this.#editorState === EDITOR_STATE.Selecting) {
            if (this.#selectionBox) {
                this.#selectionBox.pointerEvent(event, svgPoint)
            }
        }
    }

    #pointerUpEvent(event: PointerEvent) {
        if (this.#celldlDiagram === null) {
            return
        }
        const domPoint = this.#domToSvgCoords(event)
        if (this.#panning) {
            this.#panzoom!.pointerUp(event)
            this.#panning = false
            this.#setDefaultCursor()
            if (
                !this.#pointerMoved &&
                !this.#newSelectionBox &&
//                !this.#contextMenu.isOpen &&
                this.#selectionBox &&
                !this.#selectionBox.pointInside(domPoint)
            ) {
                this.#closeSelectionBox()
            }
            return
        }
        const element = event.target as SVGGraphicsElement
        const currentObject = this.#celldlDiagram.objectById(getElementId(element))

        if (this.#editorState !== EDITOR_STATE.DrawPath) {
            if (this.#activeObject && this.#moving) {
                this.#moving = false
                if (this.#moved) {
                    this.#activeObject!.endMove()
                    if (currentObject !== this.#activeObject) {
                        this.#activeObject!.finaliseMove()
                        this.#unsetActiveObject()
                    }
                }
            } else if (this.#editorState === EDITOR_STATE.Selecting) {
                if (this.#selectionBox && !this.#selectionBox.pointerEvent(event, domPoint)) {
                    this.#closeSelectionBox()
                }
                this.#newSelectionBox = false
            }
        }
    }

    #closeSelectionBox() {
        if (this.#selectionBox) {
            this.#selectionBox.close()
            this.#selectionBox = null
        }
    }

    #deleteSelectedObjects() {
        if (this.#selectedObject) {
            // Delete the object
            this.#unsetActiveObject()
            this.#celldlDiagram!.removeObject(this.#selectedObject)
            this.#unsetSelectedObject()
            this.#showStatus(null)
        } else if (this.#selectionBox) {
            for (const object of this.#selectionBox.selectedObjects) {
                this.#celldlDiagram!.removeObject(object)
            }
            this.#selectionBox.close()
            this.#selectionBox = null
        }
    }

    #focusEvent(event: FocusEvent) {
        // Detect when no input fields have focus
        this.#haveFocus = event.type === 'focusout'
    }

    #keyDownEvent(event: KeyboardEvent) {
        if (this.#editorState === EDITOR_STATE.DrawPath
         && (event.key === 'Escape' || event.key === 'Backspace')) {
            if (this.#pathMaker) {
                // Remove any partial path
                this.#pathMaker.close()
                this.#pathMaker = null
            }
        } else if (event.key === 'Backspace') {
            if (this.#haveFocus) {
                this.#deleteSelectedObjects()
            } else if (event.target === document.body) {
                // Prevent the default browser action (navigating back)
                event.preventDefault()
            }
        }
    }

    #keyUpEvent(event: KeyboardEvent) {
        if (event.key === 'Shift') {
            this.#setDefaultCursor()
        }
    }

    #showSelectedObjectInfo() {
        if (this.#selectedObject) {
            //console.log('INFO:', this.#selectedObject.asString())
        }
    }
}

//==============================================================================
//==============================================================================
