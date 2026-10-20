"""New mixed compositions for main/detail planning; read statically only."""
import torch
from torch import nn


class FiberBlend(nn.Module):
    def __init__(self):
        super().__init__()
        self.sequence = nn.RNN(8, 8, batch_first=True)
        self.project = nn.Linear(8, 8)

    def gate_path(self, x, signal):
        weight = torch.sigmoid(self.project(x))
        return weight * torch.tanh(signal)

    def weave(self, x):
        shared = torch.sigmoid(x)
        return torch.sin(shared) - torch.cos(shared)

    def forward(self, x, previous, flag):
        sequence, hidden = self.sequence(x, previous)
        gate = self.gate_path(sequence, previous)
        known = self.weave(gate)
        scores, indices = torch.topk(known, 2)
        if flag:
            chosen = torch.tanh(scores)
        else:
            chosen = unfamiliar_bridge(scores, indices)
        return chosen + gate, hidden, known


class BrokenFiberBlend(nn.Module):
    def __init__(self):
        super().__init__()
        self.sequence = nn.RNN(8, 8, batch_first=True)
        self.project = nn.Linear(8, 8)

    def gate_path(self, x, signal):
        weight = unfinished_weight(x)
        return weight * torch.tanh(signal)

    def weave(self, x):
        shared = torch.sigmoid(x)
        return torch.sin(shared) - torch.cos(shared)

    def forward(self, x, previous, flag):
        sequence, hidden = self.sequence(x, previous)
        gate = self.gate_path(sequence, previous)
        known = self.weave(gate)
        scores, indices = torch.topk(known, 2)
        if flag:
            chosen = torch.tanh(scores)
        else:
            chosen = unfamiliar_bridge(scores, indices)
        return chosen + gate, hidden, known

