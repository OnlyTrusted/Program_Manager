import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { readDir, readTextFile, writeTextFile, createDir } from "@tauri-apps/api/fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/api/shell";

// Type definitions
interface ProgramVersion {
  version: string;
  path: string;
  modules: FileNode[];
}

interface Program {
  name: string;
  versions: ProgramVersion[];
}

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface AppConfig {
  localPath: string;
  mirrorPath: string;
}

interface AppState {
  programs: Program[];
  selectedProgram: string | null;
  selectedVersion: string | null;
  expandedNodes: Set<string>;
  config: AppConfig;
  showSettings: boolean;
}

// Styles
const styles = {
  app: {
    display: "flex",
    height: "100vh",
    backgroundColor: "#1e1e1e",
    color: "#d4d4d4",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  } as React.CSSProperties,
  column: {
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #3e3e3e",
    overflow: "hidden",
  } as React.CSSProperties,
  programsColumn: {
    width: "250px",
  } as React.CSSProperties,
  versionsColumn: {
    width: "200px",
  } as React.CSSProperties,
  moduleColumn: {
    flex: 1,
  } as React.CSSProperties,
  header: {
    padding: "16px",
    borderBottom: "1px solid #3e3e3e",
    fontWeight: 600,
    fontSize: "14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as React.CSSProperties,
  list: {
    flex: 1,
    overflow: "auto",
  } as React.CSSProperties,
  listItem: {
    padding: "12px 16px",
    cursor: "pointer",
    borderBottom: "1px solid #2e2e2e",
    transition: "background-color 0.2s",
  } as React.CSSProperties,
  listItemHover: {
    backgroundColor: "#2e2e2e",
  } as React.CSSProperties,
  listItemSelected: {
    backgroundColor: "#094771",
  } as React.CSSProperties,
  button: {
    padding: "8px 16px",
    backgroundColor: "#0e639c",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
  } as React.CSSProperties,
  buttonSecondary: {
    backgroundColor: "#3e3e3e",
  } as React.CSSProperties,
  treeNode: {
    paddingLeft: "20px",
  } as React.CSSProperties,
  treeItem: {
    display: "flex",
    alignItems: "center",
    padding: "4px 8px",
    cursor: "pointer",
    userSelect: "none",
  } as React.CSSProperties,
  treeItemHover: {
    backgroundColor: "#2e2e2e",
  } as React.CSSProperties,
  icon: {
    marginRight: "6px",
    fontSize: "12px",
  } as React.CSSProperties,
  settingsPanel: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "#252526",
    border: "1px solid #3e3e3e",
    borderRadius: "8px",
    padding: "24px",
    minWidth: "500px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
    zIndex: 1000,
  } as React.CSSProperties,
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 999,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "8px",
    backgroundColor: "#3c3c3c",
    color: "#d4d4d4",
    border: "1px solid #3e3e3e",
    borderRadius: "4px",
    fontSize: "14px",
    marginTop: "8px",
  } as React.CSSProperties,
  label: {
    display: "block",
    marginBottom: "16px",
    fontSize: "14px",
  } as React.CSSProperties,
  buttonGroup: {
    display: "flex",
    gap: "8px",
    marginTop: "24px",
    justifyContent: "flex-end",
  } as React.CSSProperties,
};

// Helper function to read directory recursively
async function readDirRecursive(path: string): Promise<FileNode[]> {
  try {
    const entries = await readDir(path, { recursive: false });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const node: FileNode = {
        name: entry.name || "",
        path: entry.path,
        isDirectory: !!entry.children,
      };

      if (node.isDirectory) {
        try {
          node.children = await readDirRecursive(entry.path);
        } catch (e) {
          node.children = [];
        }
      }

      nodes.push(node);
    }

    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (e) {
    console.error("Error reading directory:", e);
    return [];
  }
}

// ProgramsColumn component
function ProgramsColumn({
  programs,
  selectedProgram,
  onSelectProgram,
  onAddProgram,
}: {
  programs: Program[];
  selectedProgram: string | null;
  onSelectProgram: (name: string) => void;
  onAddProgram: () => void;
}) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div style={{ ...styles.column, ...styles.programsColumn }}>
      <div style={styles.header}>
        <span>Programs</span>
        <button style={styles.button} onClick={onAddProgram}>
          +
        </button>
      </div>
      <div style={styles.list}>
        {programs.map((program) => (
          <div
            key={program.name}
            style={{
              ...styles.listItem,
              ...(hoveredItem === program.name ? styles.listItemHover : {}),
              ...(selectedProgram === program.name ? styles.listItemSelected : {}),
            }}
            onClick={() => onSelectProgram(program.name)}
            onMouseEnter={() => setHoveredItem(program.name)}
            onMouseLeave={() => setHoveredItem(null)}
          >
            {program.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// VersionsColumn component
function VersionsColumn({
  versions,
  selectedVersion,
  onSelectVersion,
  onAddVersion,
  programName,
}: {
  versions: ProgramVersion[];
  selectedVersion: string | null;
  onSelectVersion: (version: string) => void;
  onAddVersion: () => void;
  programName: string | null;
}) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div style={{ ...styles.column, ...styles.versionsColumn }}>
      <div style={styles.header}>
        <span>Versions</span>
        {programName && (
          <button style={styles.button} onClick={onAddVersion}>
            +
          </button>
        )}
      </div>
      <div style={styles.list}>
        {versions.map((version) => (
          <div
            key={version.version}
            style={{
              ...styles.listItem,
              ...(hoveredItem === version.version ? styles.listItemHover : {}),
              ...(selectedVersion === version.version ? styles.listItemSelected : {}),
            }}
            onClick={() => onSelectVersion(version.version)}
            onMouseEnter={() => setHoveredItem(version.version)}
            onMouseLeave={() => setHoveredItem(null)}
          >
            {version.version}
          </div>
        ))}
      </div>
    </div>
  );
}

// ModuleTreeNode component
function ModuleTreeNode({
  node,
  level,
  expandedNodes,
  onToggle,
  onOpenFile,
}: {
  node: FileNode;
  level: number;
  expandedNodes: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isExpanded = expandedNodes.has(node.path);

  return (
    <div>
      <div
        style={{
          ...styles.treeItem,
          ...(hovered ? styles.treeItemHover : {}),
          paddingLeft: `${level * 20 + 8}px`,
        }}
        onClick={() => {
          if (node.isDirectory) {
            onToggle(node.path);
          } else {
            onOpenFile(node.path);
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {node.isDirectory && (
          <span style={styles.icon}>{isExpanded ? "▼" : "▶"}</span>
        )}
        {!node.isDirectory && <span style={styles.icon}>📄</span>}
        <span>{node.name}</span>
      </div>
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <ModuleTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ModuleViewColumn component
function ModuleViewColumn({
  modules,
  expandedNodes,
  onToggle,
  onOpenFile,
  onDeleteVersion,
}: {
  modules: FileNode[];
  expandedNodes: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onDeleteVersion: () => void;
}) {
  return (
    <div style={{ ...styles.column, ...styles.moduleColumn }}>
      <div style={styles.header}>
        <span>Module View</span>
        <button
          style={{ ...styles.button, ...styles.buttonSecondary }}
          onClick={onDeleteVersion}
        >
          Delete Version
        </button>
      </div>
      <div style={styles.list}>
        {modules.map((node) => (
          <ModuleTreeNode
            key={node.path}
            node={node}
            level={0}
            expandedNodes={expandedNodes}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </div>
  );
}

// SettingsPanel component
function SettingsPanel({
  config,
  onSave,
  onCancel,
}: {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  onCancel: () => void;
}) {
  const [localPath, setLocalPath] = useState(config.localPath);
  const [mirrorPath, setMirrorPath] = useState(config.mirrorPath);

  return (
    <>
      <div style={styles.overlay} onClick={onCancel} />
      <div style={styles.settingsPanel}>
        <h2 style={{ marginBottom: "24px", fontSize: "18px" }}>Settings</h2>
        <label style={styles.label}>
          Local Storage Path:
          <input
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          Mirror Drive Path:
          <input
            type="text"
            value={mirrorPath}
            onChange={(e) => setMirrorPath(e.target.value)}
            style={styles.input}
          />
        </label>
        <div style={styles.buttonGroup}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            style={styles.button}
            onClick={() => onSave({ localPath, mirrorPath })}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

// Main App component
export function App() {
  const [state, setState] = useState<AppState>({
    programs: [],
    selectedProgram: null,
    selectedVersion: null,
    expandedNodes: new Set(),
    config: {
      localPath: "C:\\ProgramManager",
      mirrorPath: "",
    },
    showSettings: false,
  });

  // Load config and programs on mount
  useEffect(() => {
    loadConfig();
    loadPrograms();
  }, []);

  async function loadConfig() {
    try {
      const appData = await appDataDir();
      const configPath = await join(appData, "config.json");
      const configText = await readTextFile(configPath);
      const config = JSON.parse(configText);
      setState((prev) => ({ ...prev, config }));
    } catch (e) {
      // Use default config if file doesn't exist
      console.log("Using default config");
    }
  }

  async function saveConfig(config: AppConfig) {
    try {
      const appData = await appDataDir();
      const configPath = await join(appData, "config.json");
      await writeTextFile(configPath, JSON.stringify(config, null, 2));
      setState((prev) => ({ ...prev, config, showSettings: false }));
    } catch (e) {
      console.error("Error saving config:", e);
    }
  }

  async function loadPrograms() {
    try {
      const localPath = state.config.localPath;
      // Create directory if it doesn't exist
      try {
        await createDir(localPath, { recursive: true });
      } catch (e) {
        // Directory might already exist
      }

      const entries = await readDir(localPath);
      const programs: Program[] = [];

      for (const entry of entries) {
        if (entry.children) {
          const versions: ProgramVersion[] = [];
          const versionEntries = await readDir(entry.path);

          for (const versionEntry of versionEntries) {
            if (versionEntry.children) {
              const modules = await readDirRecursive(versionEntry.path);
              versions.push({
                version: versionEntry.name || "",
                path: versionEntry.path,
                modules,
              });
            }
          }

          programs.push({
            name: entry.name || "",
            versions,
          });
        }
      }

      setState((prev) => ({ ...prev, programs }));
    } catch (e) {
      console.error("Error loading programs:", e);
    }
  }

  function handleSelectProgram(name: string) {
    setState((prev) => ({
      ...prev,
      selectedProgram: name,
      selectedVersion: null,
    }));
  }

  function handleSelectVersion(version: string) {
    setState((prev) => ({ ...prev, selectedVersion: version }));
  }

  function handleToggleNode(path: string) {
    setState((prev) => {
      const newExpanded = new Set(prev.expandedNodes);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { ...prev, expandedNodes: newExpanded };
    });
  }

  async function handleOpenFile(path: string) {
    try {
      await open(path);
    } catch (e) {
      console.error("Error opening file:", e);
    }
  }

  async function handleAddProgram() {
    const name = prompt("Enter program name:");
    if (name) {
      try {
        const programPath = await join(state.config.localPath, name);
        await createDir(programPath, { recursive: true });
        await loadPrograms();
      } catch (e) {
        console.error("Error creating program:", e);
      }
    }
  }

  async function handleAddVersion() {
    if (!state.selectedProgram) return;

    const version = prompt("Enter version number:");
    if (version) {
      try {
        const versionPath = await join(
          state.config.localPath,
          state.selectedProgram,
          version
        );
        await createDir(versionPath, { recursive: true });
        await loadPrograms();
      } catch (e) {
        console.error("Error creating version:", e);
      }
    }
  }

  async function handleDeleteVersion() {
    if (!state.selectedProgram || !state.selectedVersion) return;

    if (confirm(`Delete version ${state.selectedVersion}?`)) {
      try {
        const program = state.programs.find((p) => p.name === state.selectedProgram);
        const version = program?.versions.find((v) => v.version === state.selectedVersion);
        
        if (version) {
          await invoke("remove_dir_all", { path: version.path });
          setState((prev) => ({ ...prev, selectedVersion: null }));
          await loadPrograms();
        }
      } catch (e) {
        console.error("Error deleting version:", e);
      }
    }
  }

  const selectedProgramData = state.programs.find(
    (p) => p.name === state.selectedProgram
  );
  const selectedVersionData = selectedProgramData?.versions.find(
    (v) => v.version === state.selectedVersion
  );

  return (
    <div style={styles.app}>
      <ProgramsColumn
        programs={state.programs}
        selectedProgram={state.selectedProgram}
        onSelectProgram={handleSelectProgram}
        onAddProgram={handleAddProgram}
      />
      <VersionsColumn
        versions={selectedProgramData?.versions || []}
        selectedVersion={state.selectedVersion}
        onSelectVersion={handleSelectVersion}
        onAddVersion={handleAddVersion}
        programName={state.selectedProgram}
      />
      <ModuleViewColumn
        modules={selectedVersionData?.modules || []}
        expandedNodes={state.expandedNodes}
        onToggle={handleToggleNode}
        onOpenFile={handleOpenFile}
        onDeleteVersion={handleDeleteVersion}
      />
      {state.showSettings && (
        <SettingsPanel
          config={state.config}
          onSave={saveConfig}
          onCancel={() => setState((prev) => ({ ...prev, showSettings: false }))}
        />
      )}
    </div>
  );
}
