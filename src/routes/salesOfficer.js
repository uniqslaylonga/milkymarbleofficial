async function executeLockdown() {
    closeCustomConfirm();

    const actualCash = parseFloat(document.getElementById('zActualCashInput')?.value) || 0;
    const variance = actualCash - expectedCounterCash;
    const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId') || null;

    try {
        const payload = {
            actual_cash: actualCash,
            expected_cash: expectedCounterCash,
            variance: variance,
            notes: 'Official Shift Z-Reading Transmitted from Sales Counter'
        };

        // Direktang tawag sa API endpoint
        const response = await fetch('/api/sales-officer/z-reading', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId || ''
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Server rejected the transaction');
        }

        // Kapag matagumpay na naipasok sa drawer_reconciliations:
        localStorage.setItem('isRegisterLocked', 'true');
        isRegisterLocked = true;

        closeZReadingModal();
        checkRegisterLockState();

        showCustomAlert(
            "Z-READING TRANSMITTED!",
            "The sales counter has been locked for this shift. The finalized collection summary has been recorded to drawer_reconciliations and transmitted to the Financial Officer.",
            "success"
        );

    } catch (e) {
        console.error('Error recording to database:', e);
        showCustomAlert(
            "Database Error",
            `Failed to record Z-Reading: ${e.message}. Please check your backend connection or server logs.`,
            "warning"
        );
    }
}