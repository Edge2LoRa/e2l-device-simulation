from calendar import c
import random
import json
from turtle import distance, update
from paho.mqtt import client as mqtt_client
import pandas as pd
import math
import numpy as np
from collections import defaultdict
import threading

# Setup MQTT Broker connection details
broker = 'localhost'
port = 1883
topic = "e2l/packets"
client_id = f'subscribe-{random.randint(0, 100)}'
username = 'user'
password = 'password'

# Define RL parameters
alpha = 0.1  
gamma = 0.95  
epsilon = 0.1  
# Set the number of gateways to 2, 20, or 50
number_of_gateways = 2
max_power = 200
gateway_powers = {i: max_power for i in range(number_of_gateways)}


"""
TO DO LIST:

0L) aggiungere payload al dataset

1) la power del GW va cambiata in GWresource

2) legare proporzionalmente la duration di esecuzione del task al payload, in attesa del payload facciamo su SF

3) inserire i GW presenti nel messaggio nello stato della Qtable

3) diversificare il la struttura che contiene il costo, cioè noi dobbiamo tenere traccia del costo dovuto al payload che rappresenta quanto dura il processamento
    e il costo dovuto al GW selezionato. In altre parole se seleziono un GW di quelli non presenti nel messaggio allora ho un costo più alto.

4) costo di selezione del GW, GW dentro il vettore del messaggio hanno costo BASSO, tutti gli altri GW hanno costo ALTO

5) inserimento di una variabile che tiene conto della somma dei costi, si chiama TOTAL_OST, a questa varibile dobbiamo aggiungere man mano il costo assegnato al payload e il costo di assegnamento del GW (alto o basso).

6) fissando numerodo di ED a 3000, fissando risorse a 300, produrre un grafico che traccia il TOTAL_COST nell'esecuzione di 6 esperimenti, ognuno a SF fisso, significa, un esperimento a SF=7 e trovi un valore di TC, un esperimento a SF8 e trovi un'altro valore di TC e così via e poi li plotti

7) fissando risorse a 300, fissando SF a 12, produrre un grafico che traccia il TC nell'esecuzione di 6 esperimenti, ognuno con un numero di ED diverso, significa, un esperimento con 500 ED (quando ricevi messaggio lo processi solo se devaddre < 500) e ti valcoli il TC, un esperimento con 1000 ED (quando ricevi messaggio lo processi solo se devaddre < 1000) e ti valcoli il TC, fai questa cosa per 500, 1000, 1500 .. 3000, ottieni 6 TC e il plotti 

8) fissando numerodo di ED a 3000, fissando SF a 12, produrre un grafico che traccia il TC nell'esecuzione di 6 esperimenti, ognuno con un numero di risorsa disponibile GW diversa, 50, 100, 150, 200, 250, 300 e il plotti 

9) gestire il caso in cui le risorse su tutti i GW sono esaurite in modo da assegnare a stati di questo tipo delle reward molto molto basse, costo molto alto.

fino a qui, le fai sia per dataset 2GW, 20GW e 50GW

3.bis) va estesa la struttura di stato in cui oltre alle risorse c'è anche un altro vettore che tiene conto della distanza in km (senza decimali), tra il GW e il sensor che ha trasmesso il messaggio. 

10) possibile considerare GW con potenza di processing diversificata, consideriamolo dopo

"""




if number_of_gateways == 2:
    dataset_folder = './roma-2-gw/output/merged_tx_rx'
    gateways_list_file = './roma-2-gw/2gatewaysMAC.txt'
    gateways_positions_file = './roma-2-gw/gw-conf/gw-roma-2_ns3.csv'

elif number_of_gateways == 20:
    dataset_folder = './roma-20-gw/output/merged_tx_rx'
    gateways_list_file = './roma-20-gw/20gatewaysMAC.txt'
    gateways_positions_file = './roma-20-gw/gw_info/gw-roma-20_ns3.csv'

elif number_of_gateways == 50:
    dataset_folder = './roma-50-gw/output/merged_tx_rx'
    gateways_list_file = './roma-50-gw/50gatewaysMAC.txt'
    gateways_positions_file = './roma-50-gw/gw-conf/gw-roma-50.csv'
else:
    raise Exception("Invalid number of gateways")

def haversine(lat1, lon1, lat2, lon2):
    # Earth's radius in kilometers
    R = 6371.0
    
    # Convert latitude and longitude from degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Differences in coordinates
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    
    # Haversine formula
    a = math.sin(delta_lat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    # Distance in kilometers
    distance = R * c
    return distance

# Load the list of gateways
with open(gateways_list_file, 'r') as f:
    gateways = [line.strip() for line in f]

gateways.sort()
#print("The list of gateways MAC IDs: ", gateways)

gateways_positions = pd.read_csv(gateways_positions_file)
#print(gateways_positions)

q_table = defaultdict(lambda: defaultdict(float))
active_tasks = {}

def reset_task_cost(gateway_idx, task_cost):
    global gateway_powers
    
    gateway_powers[gateway_idx] += task_cost
    if gateway_powers[gateway_idx] > max_power:
        gateway_powers[gateway_idx] = max_power  
    print(f"Task completed for Gateway {gateway_idx}. Reset power by {task_cost}. Current power: {gateway_powers[gateway_idx]}")

    # Safely remove the task from active_tasks
    if gateway_idx in active_tasks:
        del active_tasks[gateway_idx]
    else:
        print(f"Warning: Gateway {gateway_idx} not found in active tasks.")


def start_task_timer(gateway_idx, task_cost, duration=5):
    timer = threading.Timer(duration, reset_task_cost, args=(gateway_idx, task_cost))
    timer.start()
    active_tasks[gateway_idx] = {"task_cost": task_cost, "timer": timer}

# Connect to the MQTT Broker
def connect_mqtt() -> mqtt_client:
    def on_connect(client, userdata, flags, reasonCode, properties=None):
        if reasonCode == 0:
            print("Connected to MQTT Broker!")
        else:
            print("Failed to connect, return code %d\n", reasonCode)

    client = mqtt_client.Client(client_id=client_id, callback_api_version=mqtt_client.CallbackAPIVersion.VERSION2, protocol=mqtt_client.MQTTv5)
    client.username_pw_set(username, password)
    client.on_connect = on_connect
    client.connect(broker, port)
    return client

def get_state(operation_cost):
        
    powers_tuple = tuple(gateway_powers[i] for i in range(number_of_gateways))
    return (powers_tuple, operation_cost)
    
def get_possible_actions(operation_cost):
    
    return [i for i in range(number_of_gateways) 
            if gateway_powers[i] >= operation_cost]

def get_action(state, possible_actions):
    
    if not possible_actions:
        raise ValueError("No viable gateways available for this operation")
        
    if np.random.random() < epsilon:
        
        return np.random.choice(possible_actions)
    else:
        
        return get_best_action(state, possible_actions)

def get_best_action(state, possible_actions):
   
    q_values = [q_table[state][action] for action in possible_actions]
    max_q = max(q_values)
    best_actions = [action for action, q_value in zip(possible_actions, q_values) 
                    if q_value == max_q]
    return np.random.choice(best_actions)

def calculate_reward(gateway_idx, operation_cost):
    
    remaining_power = gateway_powers[gateway_idx] - operation_cost
    power_utilization = 1 - (remaining_power / max_power)


    # aggiungere un'altro vincolo che diminuisce la reward di quello stato se il GW non è di quelli in visibilità

    if remaining_power < 20:  
        return -10  
    else:
        return power_utilization  

def update(state, action, reward, next_state, next_possible_actions):
    
    if next_possible_actions:
        next_q = max(q_table[next_state][next_action] 
                    for next_action in next_possible_actions)
    else:
        next_q = 0
        
    current_q = q_table[state][action]
    q_table[state][action] = current_q + alpha * (reward + gamma * next_q - current_q)

def update_gateway_power(gateway_idx, operation_cost):
    
    gateway_powers[gateway_idx] -= operation_cost
    
def reset_gateway_powers():
    
    gateway_powers = {i: max_power for i in range(number_of_gateways)}

def intelligentJointAlgorithm(msg):
    message = json.loads(msg)
    #task_cost = random.choice([5, 10])
    task_cost = 0
    sf = message['spreading_factor']

    if sf == 7:
        task_cost += 7
    elif sf == 8:
        task_cost += 8
    elif sf == 9:
        task_cost += 9
    elif sf == 10:
        task_cost += 10
    elif sf == 11:
        task_cost += 11
    elif sf == 12:
        task_cost += 12

    taxi = [message['x_coordinate'], message['y_coordinate'], task_cost]

    current_state = get_state(task_cost)
    possible_actions = get_possible_actions(task_cost)

    selected_gateway = get_action(current_state, possible_actions)

    update_gateway_power(selected_gateway, task_cost)
    reward = calculate_reward(selected_gateway, task_cost)

    next_state = get_state(task_cost)
    next_possible_actions = get_possible_actions(task_cost)
    update(current_state, selected_gateway, reward, next_state, next_possible_actions)

    start_task_timer(selected_gateway, task_cost, duration=5)
    
    return selected_gateway

# Subscribe to the MQTT Broker
def subscribe(client: mqtt_client):
    def on_message(client, userdata, msg):
        print(f"Received `{msg.payload.decode()}`")
        print()
        selected_gateway = intelligentJointAlgorithm(msg.payload.decode())
        #print(f"Selected Gateway: {selected_gateway}")
        client.publish("gateway/selection", f"Selected Gateway: {selected_gateway}, remaining power: {gateway_powers}")
        #print (q_table)
        print(f"Selected Gateway: {selected_gateway}, remaining power: {gateway_powers}")
        print()

    client.subscribe(topic)
    client.subscribe("gateway/status") 
    client.on_message = on_message


# Run the MQTT Client
def run():
    client = connect_mqtt()
    subscribe(client)
    client.loop_forever()


if __name__ == '__main__':
    run()
