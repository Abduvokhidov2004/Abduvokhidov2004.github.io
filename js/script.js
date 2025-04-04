document.addEventListener('DOMContentLoaded', () => {
    const prices = { standard: 440, comfort: 490 };
    let selectedSeats = [];

    const seatsMap = document.getElementById('seats-map');
    const selectedList = document.getElementById('selected-list');
    const totalElement = document.getElementById('total');
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalConfirm = document.querySelector('.modal-confirm');
    const modalCancel = document.querySelector('.modal-cancel');
    const buyAllButton = document.querySelector('.buy-all');

    const warningModal = document.querySelector('.modal-overlay.modal-warning');
    const warningCloseButton = warningModal.querySelector('.modal-close');

    generateSeats();
    initModal();
    setSessionDateTime();

    function generateSeats() {
        const rows = [
            { type: 'comfort', pattern: '1111111100000011111111' },
            { type: 'comfort', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '1111111111111111111111' },
            { type: 'standard', pattern: '11111111111111111111111111' }
        ];
    
        rows.forEach((row, rowIndex) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'row';
    
            // Левая метка ряда
            const rowLabelLeft = document.createElement('div');
            rowLabelLeft.className = 'row-label';
            rowLabelLeft.textContent = rowIndex + 1;
            rowDiv.appendChild(rowLabelLeft);
    
            // Контейнер для самих мест
            const seatsContainer = document.createElement('div');
            seatsContainer.className = 'seats-container';
    
            let seatNum = 1;
            row.pattern.split('').forEach((char) => {
                if (char === '1') {
                    const seat = createSeatElement(rowIndex + 1, seatNum, row.type);
                    seatsContainer.appendChild(seat);
                    seatNum++;
                } else {
                    const empty = createEmptySpace();
                    seatsContainer.appendChild(empty);
                }
            });
    
            rowDiv.appendChild(seatsContainer);
    
            // Правая метка ряда
            const rowLabelRight = document.createElement('div');
            rowLabelRight.className = 'row-label';
            rowLabelRight.textContent = rowIndex + 1;
            rowDiv.appendChild(rowLabelRight);
    
            seatsMap.appendChild(rowDiv);
        });
    }
    

    function createSeatElement(row, seatNum, type) {
        const seat = document.createElement('div');
        seat.className = `seat ${type}`;
        seat.dataset.row = row;
        seat.dataset.seat = seatNum;
        seat.dataset.type = type;
        seat.dataset.price = prices[type];

        if (Math.random() < 0.15) seat.classList.add('occupied');

        seat.addEventListener('click', handleSeatClick);
        return seat;
    }

    function createEmptySpace() {
        const empty = document.createElement('div');
        empty.className = 'empty-space';
        return empty;
    }

    function handleSeatClick(e) {
        const seat = e.target;
        if (seat.classList.contains('occupied')) return;

        seat.classList.toggle('selected');
        const seatData = getSeatData(seat);

        if (seat.classList.contains('selected')) {
            selectedSeats.push(seatData);
        } else {
            selectedSeats = selectedSeats.filter(s =>
                s.row !== seatData.row || s.seat !== seatData.seat
            );
        }

        updateSelection();

        if (!checkSeatDistance()) {
            showWarningModal(seatData);
        }
    }

    function getSeatData(seat) {
        return {
            row: seat.dataset.row,
            seat: seat.dataset.seat,
            type: seat.dataset.type,
            price: parseInt(seat.dataset.price)
        };
    }

    function updateSelection() {
        selectedList.innerHTML = selectedSeats.map(seat => `
            <div class="seat-item">
                ${seat.row} ряд, ${seat.seat} место (${seat.type}) - ${seat.price} ₽
                <button class="remove-btn"
                    data-row="${seat.row}"
                    data-seat="${seat.seat}">×</button>
            </div>
        `).join('');

        totalElement.textContent = selectedSeats.reduce(
            (sum, seat) => sum + seat.price, 0
        );

        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', handleRemoveSeat);
        });
    }

    function handleRemoveSeat(e) {
        const { row, seat } = e.target.dataset;
        selectedSeats = selectedSeats.filter(s =>
            s.row !== row || s.seat !== seat
        );

        const seatElement = document.querySelector(
            `.seat[data-row="${row}"][data-seat="${seat}"]`
        );
        if (seatElement) seatElement.classList.remove('selected');

        updateSelection();
    }

    function checkSeatDistance() {
        if (selectedSeats.length < 2) return true;

        const sorted = [...selectedSeats].sort((a, b) => a.seat - b.seat);
        const row = sorted[0].row;

        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const current = sorted[i];

            if (current.row !== prev.row) continue;

            const gap = current.seat - prev.seat;
            if (gap === 2) {
                return false;
            }
        }

        return true;
    }

    function showWarningModal(seatToRemove) {
        if (seatToRemove) {
            selectedSeats = selectedSeats.filter(s =>
                s.row !== seatToRemove.row || s.seat !== seatToRemove.seat
            );

            const seatElement = document.querySelector(
                `.seat[data-row="${seatToRemove.row}"][data-seat="${seatToRemove.seat}"]`
            );
            if (seatElement) {
                seatElement.classList.remove('selected');
                seatElement.classList.add('shake');
                setTimeout(() => seatElement.classList.remove('shake'), 400);
            }

            updateSelection();
        }

        warningModal.classList.remove('hidden');
    }

    function initModal() {
        buyAllButton.addEventListener('click', () => {
            selectedSeats = [];
            document.querySelectorAll('.seat.selected').forEach(seat => {
                seat.classList.remove('selected');
            });

            document.querySelectorAll('.seat:not(.occupied)').forEach(seat => {
                seat.classList.add('selected');
                selectedSeats.push({
                    row: seat.dataset.row,
                    seat: seat.dataset.seat,
                    type: seat.dataset.type,
                    price: parseInt(seat.dataset.price)
                });
            });

            updateSelection();
            modalOverlay.classList.remove('hidden');
        });

        modalConfirm.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
            buyAllButton.disabled = true;
        });

        modalCancel.addEventListener('click', () => {
            selectedSeats = [];
            document.querySelectorAll('.seat.selected').forEach(seat => {
                seat.classList.remove('selected');
            });
            updateSelection();
            modalOverlay.classList.add('hidden');
        });

        warningCloseButton.addEventListener('click', () => {
            warningModal.classList.add('hidden');
        });
    }

    function setSessionDateTime() {
        const times = ['10:40', '13:10', '15:40', '18:10', '20:35', '23:00'];
        document.getElementById('current-date').textContent =
            new Date().toLocaleDateString('ru-RU');
        document.getElementById('session-time').textContent =
            times[Math.floor(Math.random() * times.length)];
    }
});
