import cron from 'node-cron';
import UserActivity from '../models/UserActivity';

// Function to calculate and update the hotness score
async function updateHotnessScores() {
    const activities = await UserActivity.find({
        hasMedia: true,
    });
    try {
        for (const activity of activities) {
            const hotnessScore = activity.calculateHotnessScore(); // assuming this method exists on your UserActivity model
            activity.hotnessScore = hotnessScore;
            await activity.save();
        }
    } catch (error) {
        console.log(error);
    }

}

// Set up a cron job to run the updateHotnessScores function every hour
cron.schedule('*/10 * * * *', async () => {
    // console.log('Cron job started: Updating hotness scores.');
    await updateHotnessScores();
    // console.log('Cron job finished.');
});