const admin = require('firebase-admin');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================
// If you have a service account key, specify the path here. 
// Otherwise, ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set.
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT || null; 
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Defaults to DRY_RUN=true for safety

console.log('------------------------------------------------------------');
console.log('🚀 NSCRP Jettsan Schema Migration Tool');
console.log(`🛠 Mode: ${DRY_RUN ? 'DRY RUN (No changes will be written)' : 'PRODUCTION (Applying changes!)'}`);
console.log('------------------------------------------------------------');

if (SERVICE_ACCOUNT_PATH) {
    const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    admin.initializeApp();
}

const db = admin.firestore();

async function migrateDatabase() {
    try {
        console.log('📁 Migrating Bookings...');
        await migrateCollection('bookings', transformBooking);

        console.log('\n📁 Migrating Schedules...');
        await migrateCollection('schedules', transformSchedule);

        console.log('\n📁 Migrating Drivers...');
        await migrateCollection('drivers', transformDriver);

        console.log('\n✅ Migration Process Finished.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

async function migrateCollection(collectionName, transformFn) {
    const snapshot = await db.collection(collectionName).get();
    console.log(`Found ${snapshot.size} documents in ${collectionName}.`);

    let count = 0;
    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const { transformed, updates } = transformFn(data, doc.id);

        if (transformed) {
            count++;
            if (!DRY_RUN) {
                batch.update(doc.ref, updates);
                batchCount++;
                
                // Firestore batch limit is 500
                if (batchCount >= 400) {
                    await batch.commit();
                    batchCount = 0;
                }
            }
        }
    }

    if (!DRY_RUN && batchCount > 0) {
        await batch.commit();
    }

    console.log(`${DRY_RUN ? '[DRY RUN] Would have updated' : 'Successfully updated'} ${count} documents in ${collectionName}.`);
}

// -----------------------------------------------------------------------------
// TRANSFORMERS
// -----------------------------------------------------------------------------

function transformBooking(data, id) {
    const updates = {};
    let transformed = false;

    // 1. Convert pickup_location object to string + array
    if (data.pickup_location && typeof data.pickup_location === 'object' && data.pickup_location.address) {
        console.log(`  -> Updating Booking [${id}]: Transforming pickup_location object to array`);
        const originalLoc = data.pickup_location;
        updates.pickup_location = originalLoc.address;
        updates.pickup_points = [
            {
                name: originalLoc.address,
                latitude: originalLoc.latitude || 0,
                longitude: originalLoc.longitude || 0,
                order: 1
            }
        ];
        transformed = true;
    }

    // 2. Enforce Jettsan Contractor
    if (data.contractor !== 'Jettsan') {
        updates.contractor = 'Jettsan';
        transformed = true;
    }

    // 3. Add isOfficial boolean if missing
    if (data.isOfficial === undefined) {
        updates.isOfficial = false;
        transformed = true;
    }

    return { transformed, updates };
}

function transformSchedule(data, id) {
    const updates = {};
    let transformed = false;

    // 1. Convert pickup_location object to Array (for Android model compliance)
    if (data.pickup_location && typeof data.pickup_location === 'object' && !Array.isArray(data.pickup_location)) {
        console.log(`  -> Updating Schedule [${id}]: Converting pickup_location object to List`);
        const loc = data.pickup_location;
        updates.pickup_location = [
            {
                address: loc.address || loc.name || 'Unknown',
                latitude: loc.latitude || 0,
                longitude: loc.longitude || 0,
                timestamp: data.created_at || admin.firestore.FieldValue.serverTimestamp()
            }
        ];
        transformed = true;
    }

    // 2. Set accredited_company_id to jettsan
    if (data.accredited_company_id !== 'jettsan') {
        updates.accredited_company_id = 'jettsan';
        updates.company_name = 'Jettsan';
        transformed = true;
    }

    // 3. Initialize NSCRP operational fields if they don't exist
    const nscrpFields = ['odometer_start', 'odometer_end', 'overtime_hours', 'passenger_signature_url'];
    nscrpFields.forEach(field => {
        if (data[field] === undefined) {
            updates[field] = field === 'passenger_signature_url' ? '' : 0;
            transformed = true;
        }
    });

    return { transformed, updates };
}

function transformDriver(data, id) {
    const updates = {};
    let transformed = false;

    if (data.accredited_company_id !== 'jettsan') {
        console.log(`  -> Updating Driver [${id}]: Assigning to Jettsan`);
        updates.accredited_company_id = 'jettsan';
        transformed = true;
    }

    return { transformed, updates };
}

// RUN
migrateDatabase();
