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

import type { Extent } from '@editor/geometry'

import { getViewbox } from '@renderer/common/svgUtils'
import { Point } from '@renderer/common/points'

import { editGuides } from './editguides'

//==============================================================================

export default class PanZoom {
    #panning: boolean = false
    #pointerDownPosition: Point = new Point()

    #svgDiagram: SVGSVGElement | null = null
    #containerId: string
    #containerOrigin: Point = new Point()
    #containerSize: Point = new Point()
    #resizeObserver: ResizeObserver

    #minScale: number = 0.125
    #scale: number = 1
    #maxScale: number = 32
    #step: number = 0.05

    constructor(container: HTMLElement) {
        // options
        container.addEventListener('wheel', this.#wheelEvent.bind(this), { passive: true })
        this.#containerId = container.id
        this.#containerOrigin = new Point(
            container.offsetLeft + container.clientLeft,
            container.offsetTop + container.clientTop
        )
        this.#containerSize = new Point(container.clientWidth, container.clientHeight)
        this.#resizeObserver = new ResizeObserver(this.#resizeObservation.bind(this))
        this.#resizeObserver.observe(container)
    }

    get panning() {
        return this.#panning
    }

    get scale() {
        return this.#scale
    }

    #currentViewbox(): Extent {
        return getViewbox(this.#svgDiagram!)
    }

    #setViewbox(viewbox: Extent) {
        editGuides.viewboxUpdated(viewbox)
        this.#svgDiagram!.setAttribute('viewBox', viewbox.map((n) => String(n)).join(' '))
    }

    enable(svgDiagram: SVGSVGElement) {
        // Scale large diagrams down to fit container
        let viewbox = getViewbox(svgDiagram)
        if (viewbox[2] * this.#containerSize.y >= viewbox[3] * this.#containerSize.x) {
            // Too wide, so scale width
            this.#scale = this.#containerSize.x / viewbox[2]
            viewbox[1] -= (this.#containerSize.y / this.#scale - viewbox[3]) / 2
            viewbox[3] = this.#containerSize.y / this.#scale
        } else {
            // Too high, so scale height
            this.#scale = this.#containerSize.y / viewbox[3]
            viewbox[0] -= (this.#containerSize.x / this.#scale - viewbox[2]) / 2
            viewbox[2] = this.#containerSize.x / this.#scale
        }
        if (this.#minScale > this.#scale) {
            this.#minScale = this.#scale
        }

        // Otherwise centre small diagrams that don't require scaling down
        if (this.#scale >= 1) {
            this.#scale = 1
            viewbox = getViewbox(svgDiagram)
            const delta = this.#containerSize.subtract({ x: viewbox[2], y: viewbox[3] })
            viewbox[0] -= delta.x / 2
            viewbox[1] -= delta.y / 2
            viewbox[2] = this.#containerSize.x
            viewbox[3] = this.#containerSize.y
        }

        this.#svgDiagram = svgDiagram
        this.#setViewbox(viewbox)
        this.#panning = false
    }

    disable() {
        this.#svgDiagram = null
        this.#panning = false
        this.#scale = 1.0
    }

    pointerDown(event: PointerEvent) {
        this.#panning = true
        this.#pointerDownPosition = Point.fromPoint(event)
    }

    pointerMove(event: PointerEvent): boolean {
        if (this.#svgDiagram && this.#panning) {
            const delta = this.#pointerDownPosition.subtract(event).scalarScale(1.0 / this.#scale)
            if (!delta.isZero()) {
                const viewbox = this.#currentViewbox()
                viewbox[0] += delta.x
                viewbox[1] += delta.y
                this.#setViewbox(viewbox)
                this.#pointerDownPosition = Point.fromPoint(event)
                return true
            }
        }
        return false
    }

    pointerUp(_event: PointerEvent) {
        this.#panning = false
    }

    #resizeObservation(entries: ResizeObserverEntry[]) {
        if (this.#svgDiagram) {
            for (const entry of entries) {
                if (entry.target.id === this.#containerId) {
                    const containerSize = new Point(entry.contentRect.width, entry.contentRect.height)
                    // Don't do anything if the container has no size...
                    if (containerSize.x === 0 ||containerSize.y === 0) {
                        return
                    }
                    const viewbox = this.#currentViewbox()
                    const delta = containerSize.subtract(this.#containerSize)
                    if (Math.abs(delta.x * viewbox[3]) >= Math.abs(delta.y * viewbox[2])) {
                        this.#scale = containerSize.x / viewbox[2]
                        viewbox[1] -= (this.#containerSize.y / this.#scale - viewbox[3]) / 2
                        viewbox[3] = containerSize.y / this.#scale
                    } else {
                        this.#scale = containerSize.y / viewbox[3]
                        viewbox[0] -= (this.#containerSize.x / this.#scale - viewbox[2]) / 2
                        viewbox[2] = containerSize.x / this.#scale
                    }
                    this.#containerSize = containerSize
                    this.#setViewbox(viewbox)
                }
            }
        }
    }

    #wheelEvent(event: WheelEvent) {
        if (this.#svgDiagram) {
            // Normalise in case shift modifier is used on macOS
            const delta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY
            const wheel = delta < 0 ? 1 : -1
            const toScale = this.#scale * Math.exp((wheel * this.#step) / 3)
            this.#scale = Math.min(Math.max(toScale, this.#minScale), this.#maxScale)
            const viewSize = this.#containerSize.scalarScale(1.0 / this.#scale)
            const viewbox = this.#currentViewbox()
            viewbox[0] +=
                ((viewbox[2] - viewSize.x) * (event.clientX - this.#containerOrigin.x)) / this.#containerSize.x
            viewbox[1] +=
                ((viewbox[3] - viewSize.y) * (event.clientY - this.#containerOrigin.y)) / this.#containerSize.y
            viewbox[2] = viewSize.x
            viewbox[3] = viewSize.y
            this.#setViewbox(viewbox)
        }
    }
}

//==============================================================================
