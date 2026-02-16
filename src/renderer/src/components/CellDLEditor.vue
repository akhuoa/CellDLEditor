<template lang="pug">
    .flex.flex-col.h-full
        main.relative.flex.grow(
            class="min-h-calc(100% - 1.6em)"
        )
            EditorToolbar.editor-bar(
                :buttons="toolButtons"
                type="popover"
                @button-event="buttonEvent"
                @popover-event="popoverEvent"
            )
            div.flex.grow.m-0.overflow-hidden.bordered(ref="svgContent")
                <!-- context-menu(id="context-menu")  -->
            div.absolute.w-250px.bordered.border-l.top-0.right-38px(
                class="bottom-1.6em"
                :class="{ hidden: !panelVisible }"
            )
                component(
                        v-if="panelComponent"
                        :is="panelComponent"
                        :toolId="panelToolId"
                        @panel-event="panelEvent"
                        @style-event="styleEvent"
                    )
            EditorToolbar.editor-bar(
                :buttons="panelButtons"
                type="panel"
                @button-event="buttonEvent"
            )
        footer.status-bar
            span#status-msg
            span#status-pos
</template>

<script setup lang="ts">
import * as vue from 'vue'

import primeVueAuraTheme from '@primeuix/themes/aura'
import primeVueConfig from 'primevue/config'

import vueTippy from 'vue-tippy'
import 'tippy.js/dist/tippy.css'

//==============================================================================

import '@renderer/assets/style.css'
import '@renderer/assets/icons.css'

import * as vueCommon from '@renderer/common/vueCommon'

import { type StyleObject } from '@editor/components/properties'
import { CellDLDiagram } from '@editor/diagram/index'

import { CellDLEditor } from '@editor/editor/index'
import { DEFAULT_EDITOR_TOOL_ID, EDITOR_TOOL_IDS, PANEL_IDS } from '@editor/editor/index'
import { editGuides } from '@editor/editor/editguides'
import { undoRedo } from '@editor/editor/undoredo'

import { type EditorToolButton } from '@renderer/common/EditorTypes'
import EditorToolbar from '@renderer/components/toolbar/EditorToolbar.vue'

import ComponentPopover from '@renderer/components/popovers/ComponentPopover.vue'
import ConnectionStylePopover from '@renderer/components/popovers/ConnectionStylePopover.vue'

import PropertiesPanel from '@renderer/components/panels/PropertiesPanel.vue'

import { componentLibraryPlugin } from '@renderer/plugins/index'
import { BondgraphPlugin } from '@renderer/plugins/bondgraph/index'

//==============================================================================

import type {
    CellDLEditorProps,
    EditorData,
    EditorEditCommand,
    EditorFileCommand,
    EditorSetStateCommand,
    EditorViewCommand
} from '../../index'

const props = defineProps<CellDLEditorProps>()

//==============================================================================
//==============================================================================

// Setup PrimeVue's theme, vue-tippy, and our plugins

const crtInstance = vue.getCurrentInstance();

if (crtInstance) {
    const app = crtInstance.appContext.app;

    if (!app.config.globalProperties.$primevue) {
        app.use(primeVueConfig as unknown as vue.Plugin, {
            theme: {
                preset: primeVueAuraTheme,
                options: {
                    darkModeSelector: '.celldl-dark-mode'
                }
            }
        })
    }

    app.use(vueTippy)

    // Install our component library plugin manager and the Bondgraph plugin

    componentLibraryPlugin.install(app, {})
    componentLibraryPlugin.registerPlugin(new BondgraphPlugin())
}

vueCommon.useTheme().setTheme(props.theme)

//==============================================================================

vue.watch(
    () => props.theme,
    () => {
        vueCommon.useTheme().setTheme(props.theme)
    }
)

//==============================================================================

// Set the default component from the component library

const defaultComponent = componentLibraryPlugin.getSelectedTemplate()!

//==============================================================================
//==============================================================================

const svgContent = vue.ref(null)

let celldlDiagram: CellDLDiagram|undefined

//==============================================================================

function despatchToolbarEvent(type: string, source: string, value: boolean|string) {
    document.dispatchEvent(
        new CustomEvent('toolbar-event', {
            detail: {
                type,
                source,
                value
            }
        })
    )
}

//==============================================================================

import { DEFAULT_CONNECTION_STYLE_DEFINITION } from '@editor/connections/index'

function connectionStylePrompt(name: string): string {
    return `Draw ${name.toLowerCase()} connection`
}

//==============================================================================

// Plugins need to be initialised before creating the editor

let celldlEditor: CellDLEditor = new CellDLEditor()

//==============================================================================
//==============================================================================

const toolButtons = vue.ref<EditorToolButton[]>([
    {
        toolId: EDITOR_TOOL_IDS.SelectTool,
        active: (DEFAULT_EDITOR_TOOL_ID as EDITOR_TOOL_IDS) === EDITOR_TOOL_IDS.SelectTool,
        prompt: 'Selection tool',
        icon: 'ci-pointer'
    },
    {
        toolId: EDITOR_TOOL_IDS.DrawConnectionTool,
        active: (DEFAULT_EDITOR_TOOL_ID as EDITOR_TOOL_IDS) === EDITOR_TOOL_IDS.DrawConnectionTool,
        prompt: connectionStylePrompt(DEFAULT_CONNECTION_STYLE_DEFINITION.name),
        icon: DEFAULT_CONNECTION_STYLE_DEFINITION.icon,
        panel: vue.markRaw(ConnectionStylePopover)
    },
    {
        toolId: EDITOR_TOOL_IDS.AddComponentTool,
        active: (DEFAULT_EDITOR_TOOL_ID as EDITOR_TOOL_IDS) === EDITOR_TOOL_IDS.AddComponentTool,
        prompt: defaultComponent.name,
        image: defaultComponent.image,
        panel: vue.markRaw(ComponentPopover)
    }
])

//==============================================================================

const panelButtons = vue.ref<EditorToolButton[]>([
    {
        toolId: PANEL_IDS.PropertyPanel,
        prompt: 'Component properties',
        icon: 'ci-cog',
        panel: vue.markRaw(PropertiesPanel)
    }
])

const panelComponent = vue.ref<vue.Raw<vue.Component>>()

const panelVisible = vue.ref<boolean>()
panelVisible.value = false

const panelToolId = vue.ref<string>()

//==============================================================================

function resetToolBars() {
    // Set the toolbar to its default tool

    for (const toolButton of toolButtons.value) {
        toolButton.active = (DEFAULT_EDITOR_TOOL_ID as EDITOR_TOOL_IDS) === toolButton.toolId
    }

    // Hide any open panel
    // FUTURE: reset to default panel tool

    panelVisible.value = false
}

//==============================================================================

function buttonEvent(toolId: string, active: boolean, newComponent: vue.Raw<vue.Component> | null) {
    if (newComponent) {
        // Update the RH panel to show its current component

        if (active) {
            panelComponent.value = newComponent
            panelToolId.value = toolId
        }
        panelVisible.value = active
    }

    // Tell the editor that a tool has changed

    despatchToolbarEvent('state', toolId, active)
}

//==============================================================================

function popoverEvent(toolId: string, data: any) {
    if (toolId === EDITOR_TOOL_IDS.DrawConnectionTool) {
        toolButtons.value[1]!.prompt = connectionStylePrompt(data.name)
        toolButtons.value[1]!.icon = data.icon

        // Tell the editor that the connection style has changed

        despatchToolbarEvent('value', toolId, data.id)

    } else if (toolId === EDITOR_TOOL_IDS.AddComponentTool) {
        toolButtons.value[2]!.prompt = data.name
        toolButtons.value[2]!.image = data.image

        // Tell the editor that the component template has changed

        despatchToolbarEvent('value', toolId, data.id)
    }
}

function panelEvent(toolId: string, itemId: string, oldValue: string, newValue: string) {
    document.dispatchEvent(
        new CustomEvent('panel-event', {
            detail: {
                type: 'value',
                source: toolId,
                itemId: itemId,
                value: {
                    oldValue,
                    newValue
                }
            }
        })
    )
}

function styleEvent(toolId: string, object: string, styling: StyleObject) {
    document.dispatchEvent(
        new CustomEvent('style-event', {
            detail: {
                type: 'value',
                source: toolId,
                object,
                styling
            }
        })
    )
}

//==============================================================================
//==============================================================================

const emit = defineEmits<{
    'editor-data': [data: EditorData],
    'error': [msg: string]
}>()

vue.watch(
    () => props.editorCommand,
    async () => {
        if (props.editorCommand?.command === 'file') {
            const command = props.editorCommand as EditorFileCommand
            const options = command.options
            if  (options.action === 'close') {
                resetToolBars()
                celldlDiagram = new CellDLDiagram('', '', celldlEditor)
                await celldlEditor.editDiagram(celldlDiagram)
            } else if (options.action === 'open') {
                resetToolBars()
                if (options.data !== undefined) {
                    try {
                        celldlDiagram = new CellDLDiagram(options?.name || '', options.data, celldlEditor)
                        await celldlEditor.editDiagram(celldlDiagram)
                    } catch(err) {
                        emit('error', `Cannot open ${options?.name} -- invalid CellDL file?`)
                    }
                }
            } else if (options.action === 'data') {
                const celldl = await celldlDiagram?.serialise()
                emit('editor-data', {
                    data: celldl,
                    kind: options.kind
                } as EditorData)
            }
        } else if (props.editorCommand?.command === 'edit') {
            const command = props.editorCommand as EditorEditCommand
            const options = command.options
            if (options.action === 'clean') {
                undoRedo.clean()
            }
        } else if (props.editorCommand?.command === 'set-state') {
            const command = props.editorCommand as EditorSetStateCommand
            const options = command.options
            if (options.action === 'reset-tools') {
                resetToolBars()
            }
        } else if (props.editorCommand?.command === 'view') {
            const command = props.editorCommand as EditorViewCommand
            editGuides.setState(command.options)
        }
    }
)

//==============================================================================

vue.onMounted(async () => {

    // Tell the editor about the default connection style and component

    despatchToolbarEvent('value', EDITOR_TOOL_IDS.DrawConnectionTool, DEFAULT_CONNECTION_STYLE_DEFINITION.id)
    despatchToolbarEvent('value', EDITOR_TOOL_IDS.AddComponentTool, defaultComponent.id)

    if (svgContent.value) {
        celldlEditor.mount(svgContent.value)

        // Create a new diagram in the editor's window
        celldlDiagram = new CellDLDiagram('', '', celldlEditor)

        await celldlDiagram.edit()
    }
})

//==============================================================================
//==============================================================================
</script>

<style scoped>
.editor-bar {
    width: 40px;
    overflow: auto;
}
.bordered {
    border: 2px solid var(--editor-border-color);
}
.hidden {
    display: none;
}
.status-bar {
    min-height: 1.6em;
    border-top: 1px solid var(--editor-border-color);
    padding-left: 16px;
    padding-right: 16px;
    background-color: var(--editor-statusbar-background);
}
#status-msg.error {
    color: red;
}
#status-msg.warn {
   color: blue;
}
#status-pos {
    float: right;
}
</style>
