import {warm} from './warm';
import axios from 'axios';

export default (req, res) => {
	res.status(200).json({"status": "Running"});
};

axios.get(process.env.WARM_CONFIG_URL).then(res => res.data.warm.forEach(warm))
