<template lang="pug">
    Menubar(ref="menuBar" :model="menuItems")
        template(#item="{ item, props, root }")
            a(v-bind="props.action")
                .p-icon(
                    v-if="item.icon !== undefined"
                    :class="item.icon"
                )
                div.p-menubar-item-label {{ item.label }}
                i.pi.pi-angle-right.ml-auto(
                    v-if="!root && item.items !== undefined"
                )
                .ml-auto.border.rounded.shortcut(
                    v-if="item.shortcut !== undefined"
                    class="text-xs/3"
                ) {{ item.shortcut }}
</template>

<script setup lang="ts">
import * as vue from 'vue'
import * as vueusecore from '@vueuse/core'

import type Menubar from 'primevue/menubar'
import type { MenuItem, MenuItemCommandEvent } from 'primevue/menuitem'

//==============================================================================

import type { EditorState, ViewState } from '@celldl/editor'

import * as common from '../common/common'

//==============================================================================

const props = defineProps<{
    editorState: EditorState
    fileModified: boolean  // to become part of editor state
    haveFile: boolean
    noPython?: boolean
    viewState: ViewState
}>()

const emit = defineEmits([
    'about',
    'edit-action',
    'export-action',
    'file-action',
    'menu-active',
    'settings',
    'view-action'
])

const isWindowsOrLinux = common.isWindows() || common.isLinux()
const isMacOs = common.isMacOs()

const fileOperationsAvailable = common.isCompatibleBrowser()

//==============================================================================

function getCheckedIcon(checked: boolean): string {
    if (checked) {
        return 'pi pi-check'
    } else {
        return 'pi'
    }
}

function itemChecked(item: MenuItem): boolean {
    return item.icon.includes('pi-check')
}

function toggleCheckedIcon(item: MenuItem): string {
    return getCheckedIcon(!itemChecked(item))
}

//==============================================================================

let snapToGridValue = props.viewState.snapToGrid

const snapToGrid = vue.computed<number>({
    get() {
        return snapToGridValue
    },
    set(value: number) {
        snapToGridValue = value
        snapToGridItems[0]!.icon = getCheckedIcon(value === 1)
        snapToGridItems[1]!.icon = getCheckedIcon(value > 0 && value < 1)
        snapToGridItems[2]!.icon = getCheckedIcon(value === 0)
        emit('view-action', 'snap-to-grid', value)
    }
})

const snapToGridItems = [
    {
        label: 'Always',
        icon: getCheckedIcon(snapToGrid.value === 1),
        command: (e: MenuItemCommandEvent) => {
            snapToGrid.value = 1
        }
    },
    {
        label: 'Close',
        icon: getCheckedIcon(snapToGrid.value > 0 && snapToGrid.value < 1),
        command: (e: MenuItemCommandEvent) => {
            snapToGrid.value = 0.5
        }
    },
    {
        label: 'None',
        icon: getCheckedIcon(snapToGrid.value === 0),
        command: (e: MenuItemCommandEvent) => {
            snapToGrid.value = 0
        }
    }
]

//==============================================================================

const viewItems = {
    label: 'View',
    items: [
        {
            label: 'Grid',
            icon: getCheckedIcon(props.viewState.showGrid),
            command: (e: MenuItemCommandEvent) => {
                e.item.icon = toggleCheckedIcon(e.item)
                emit('view-action', 'show-grid', itemChecked(e.item))
            }
        },
        {
            label: 'Snap',
            icon: 'pi',
            items: snapToGridItems
        }
    ]
}

//==============================================================================
//==============================================================================

const menuItems = [
    {
        label: 'File',
        items: [
            {
                label: 'New',
                shortcut: isWindowsOrLinux ? 'Ctrl+N' : isMacOs ? '⌘N' : undefined,
                command: () => {
                    emit('file-action', 'new')
                }
            },
            {
                label: 'Open...',
                shortcut: isWindowsOrLinux ? 'Ctrl+O' : isMacOs ? '⌘O' : undefined,
                command: () => {
                    emit('file-action', 'open')
                },
                visible: fileOperationsAvailable
            },
            {
                separator: true,
                visible: fileOperationsAvailable
            },
            {
                label: 'Save...',
                shortcut: isWindowsOrLinux ? 'Ctrl+S' : isMacOs ? '⌘S' : undefined,
                command: () => {
                    emit('file-action', 'save')
                },
                disabled: () => !(props.haveFile && props.fileModified),
                visible: fileOperationsAvailable
            },
            {
                label: 'Save As...',
                command: () => {
                    emit('file-action', 'save-as')
                },
                disabled: () => !props.haveFile,
                visible: fileOperationsAvailable
            },
            {
                separator: true,
                visible: fileOperationsAvailable && !props.noPython
            },
            {
                label: 'Generate CellML...',
                command: () => {
                    emit('export-action', 'cellml')
                },
                disabled: () => !(props.haveFile && !props.fileModified),
                visible: () => fileOperationsAvailable && !props.noPython
            }
        ]
    },
/*** WIP
    {
        label: 'Edit',
        items: [
            {
                label: 'Undo',
                icon: 'pi pi-undo',
                shortcut: isWindowsOrLinux ? 'Ctrl+Z' : isMacOs ? '⌘Z' : undefined,
                command: () => {
                    emit('edit-action', 'undo')
                },
                disabled: !props.editorState.fileModified
            },
            {
                label: 'Redo',
                shortcut: isWindowsOrLinux ? 'Ctrl+Shift+O' : isMacOs ? '⇧⌘O' : undefined,
                command: () => {
                    emit('edit-action', 'redo')
                },
                disabled: !props.editorState.redoContents
            },
            { separator: true },
            {
                label: 'Cut',
                icon: 'pi pi-file-export',
                shortcut: isWindowsOrLinux ? 'Ctrl+X' : isMacOs ? '⌘X' : undefined,
                command: () => {
                    emit('edit-action', 'cut')
                },
                disabled: !props.editorState.itemSelected
            },
            {
                label: 'Copy',
                icon: 'pi pi-copy',
                shortcut: isWindowsOrLinux ? 'Ctrl+C' : isMacOs ? '⌘C' : undefined,
                command: () => {
                    emit('edit-action', 'copy')
                },
                disabled: !props.editorState.itemSelected
            },
            {
                label: 'Paste',
                icon: 'pi pi-clipboard',
                shortcut: isWindowsOrLinux ? 'Ctrl+V' : isMacOs ? '⌘V' : undefined,
                command: () => {
                    emit('edit-action', 'paste')
                },
                disabled: !props.editorState.pasteContents
            },
            {
                label: 'Delete',
                icon: 'pi pi-trash',
                shortcut: isWindowsOrLinux ? 'Del' : isMacOs ? '⌦' : undefined,
                command: () => {
                    emit('edit-action', 'delete')
                },
                disabled: !props.editorState.itemSelected
            }
        ]
    },
WIP ***/
    viewItems,
    {
        label: 'Help',
        items: [
            {
                label: 'Home Page',
                command: () => {
                    window.open('https://github.com/CellDL/CellDLEditor')
                }
            },
            { separator: true },
            {
                label: 'Report Issue',
                command: () => {
                    window.open('https://github.com/CellDL/CellDLEditor/issues/new')
                }
            },
            { separator: true },
            {
                label: 'About the Editor',
                command: () => {
                    emit('about')
                }
            }
        ]
    }
]

//==============================================================================

// Keyboard shortcuts.

if (common.isDesktop()) {
    vueusecore.onKeyStroke((event: KeyboardEvent) => {
        if (common.isCtrlOrCmd(event) && !event.shiftKey && event.code === 'KeyN') {
            event.preventDefault()
            emit('file-action', 'new')
        } else if (common.isCtrlOrCmd(event) && !event.shiftKey && event.code === 'KeyO') {
            event.preventDefault()
            emit('file-action', 'open')
        } else if (props.haveFile && common.isCtrlOrCmd(event) && !event.shiftKey && event.code === 'KeyS') {
            event.preventDefault()
            emit('file-action', 'save')
        }
    })
}

//==============================================================================

// A few things that can only be done when the component is mounted.

const menuBar = vue.ref<(vue.ComponentPublicInstance<typeof Menubar> & { hide: () => void }) | null>(null)

vue.onMounted(() => {
    if (menuBar.value !== null) {
        // Ensure that the menubar never gets the 'p-menubar-mobile' class, which would turn it into a hamburger menu.

        const menuBarElement = menuBar.value.$el as HTMLElement
        const mutationObserver = new MutationObserver(() => {
            if (menuBarElement.classList.contains('p-menubar-mobile')) {
                menuBarElement.classList.remove('p-menubar-mobile')
            }
        })

        mutationObserver.observe(menuBarElement, { attributes: true, attributeFilter: ['class'] })

        // Close the menu when clicking clicking on the menubar but outside of the main menu items.

        function onClick(event: MouseEvent) {
            const target = event.target as HTMLElement

            if (
                menuBarElement.contains(target) &&
                !menuBarElement.querySelector('.p-menubar-root-list')?.contains(target) &&
                !Array.from(document.querySelectorAll('.p-menubar-submenu')).some((submenu) => submenu.contains(target))
            ) {
                menuBar.value?.hide()
            } else if (target.classList.contains('p-menubar-item-label')
                    || target.classList.contains('p-menubar-root-list')) {
                emit('menu-active')
            }
        }

        document.addEventListener('click', onClick)

        // Clean up the mutation observer and event listener when the component is unmounted.

        vue.onBeforeUnmount(() => {
            mutationObserver.disconnect()

            document.removeEventListener('click', onClick)
        })
    }
})

//==============================================================================

</script>

<style scoped>
.p-menubar {
  padding: 0.1rem;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid var(--border-color);
}

.p-menubar
  > .p-menubar-root-list
  > .p-menubar-item
  > .p-menubar-item-content
  > .p-menubar-item-link
  .p-menubar-submenu-icon {
  display: none;
}

:deep(.p-menubar-submenu .p-menubar-item-link:hover:not(:has(.p-menubar-submenu))) {
  border-radius: var(--p-menubar-item-border-radius);
  background-color: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

:deep(.p-menubar-submenu .p-menubar-item-link:hover:not(:has(.p-menubar-submenu)) .shortcut) {
  border-color: var(--p-primary-contrast-color);
  background-color: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

:deep(.p-menubar-submenu .p-menubar-item-link:hover:not(:has(.p-menubar-submenu)) > .p-menubar-submenu-icon) {
  color: var(--p-primary-contrast-color) !important;
}

.p-menubar-item-link {
  padding: 0.25rem 0.5rem !important;
}

:deep(.p-menubar-root-list) {
  gap: 0.1rem;
}

:deep(.p-menubar-submenu) {
  padding: 0.1rem;
  z-index: 10;
}

.shortcut {
  border-color: var(--p-content-border-color);
  background: var(--p-content-hover-background);
  color: var(--p-text-muted-color);
}
</style>
