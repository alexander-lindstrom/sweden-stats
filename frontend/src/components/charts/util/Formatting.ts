export const formatValue = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000) {
    return (value / 1000).toFixed(1) + 'B SEK';
    } else if (absValue >= 1) {
    return value.toFixed(1) + 'M SEK';
    } else {
    return (value * 1000).toFixed(0) + 'K SEK';
    }
};