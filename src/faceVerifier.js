function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizeVector(vector) {
    if (!Array.isArray(vector)) return [];
    return vector
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
}

function computeSimilarity(reference, live) {
    const a = normalizeVector(reference);
    const b = normalizeVector(live);
    const length = Math.min(a.length, b.length);

    if (length === 0) {
        return 72;
    }

    let diff = 0;
    for (let i = 0; i < length; i += 1) {
        diff += Math.abs(a[i] - b[i]);
    }

    const averageDifference = diff / length;
    const score = 100 - ((averageDifference / 255) * 100);
    return clamp(Math.round(score), 35, 99);
}

async function verifyFaceMatch({ referenceDescriptor, liveDescriptor, fallbackScore = 0, studentId }) {
    const reference = Array.isArray(referenceDescriptor) ? referenceDescriptor : [];
    const live = Array.isArray(liveDescriptor) ? liveDescriptor : [];

    let score = fallbackScore;
    if (reference.length > 0 && live.length > 0) {
        score = computeSimilarity(reference, live);
    }

    const provider = process.env.FACE_PROVIDER || 'demo';
    const ok = score >= 70;

    return {
        provider,
        studentId: studentId || null,
        score,
        ok,
        reason: ok ? 'Face verification passed.' : 'Low face match confidence.'
    };
}

module.exports = {
    verifyFaceMatch,
    computeSimilarity
};
