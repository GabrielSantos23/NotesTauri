import React from "react";

export const ScrollbarExamples: React.FC = () => {
  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-6">
        Scrollbar Customization Examples
      </h1>

      {/* Default scrollbar */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Default Scrollbar</h2>
        <div className="h-32 w-64 border rounded-lg p-4 overflow-auto bg-card">
          <div className="space-y-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="p-2 bg-muted rounded">
                Item {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Thin scrollbar */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Thin Scrollbar</h2>
        <div className="h-32 w-64 border rounded-lg p-4 overflow-auto bg-card scrollbar-thin">
          <div className="space-y-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="p-2 bg-muted rounded">
                Item {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom themed scrollbar */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Custom Themed Scrollbar</h2>
        <div className="h-32 w-64 border rounded-lg p-4 overflow-auto bg-card scrollbar-custom">
          <div className="space-y-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="p-2 bg-muted rounded">
                Item {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rounded scrollbar */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Rounded Scrollbar</h2>
        <div className="h-32 w-64 border rounded-lg p-4 overflow-auto bg-card scrollbar-rounded">
          <div className="space-y-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="p-2 bg-muted rounded">
                Item {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden scrollbar */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          Hidden Scrollbar (Still Scrollable)
        </h2>
        <div className="h-32 w-64 border rounded-lg p-4 overflow-auto bg-card scrollbar-hidden">
          <div className="space-y-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="p-2 bg-muted rounded">
                Item {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Horizontal scrollbar example */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Horizontal Scrollbar</h2>
        <div className="h-32 w-64 border rounded-lg p-4 overflow-auto bg-card scrollbar-custom">
          <div className="flex space-x-4 w-max">
            {Array.from({ length: 15 }, (_, i) => (
              <div
                key={i}
                className="p-4 bg-muted rounded min-w-[120px] flex-shrink-0"
              >
                Card {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Usage instructions */}
      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Usage Instructions:</h3>
        <ul className="space-y-1 text-sm">
          <li>
            <code className="bg-background px-1 rounded">scrollbar-thin</code> -
            Thin scrollbar with minimal styling
          </li>
          <li>
            <code className="bg-background px-1 rounded">scrollbar-custom</code>{" "}
            - Themed scrollbar that matches your design system
          </li>
          <li>
            <code className="bg-background px-1 rounded">
              scrollbar-rounded
            </code>{" "}
            - Rounded scrollbar with padding
          </li>
          <li>
            <code className="bg-background px-1 rounded">scrollbar-hidden</code>{" "}
            - Completely hidden scrollbar (still scrollable)
          </li>
        </ul>
      </div>
    </div>
  );
};
