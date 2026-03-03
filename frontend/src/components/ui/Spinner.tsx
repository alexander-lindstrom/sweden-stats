/**
 * Centred loading spinner. Works both in full-height containers (map chart
 * area) and in natural-flow containers like sidebar sections.
 */
export function Spinner() {
  return (
    <div className="flex items-center justify-center w-full min-h-[72px]">
      <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
    </div>
  );
}
