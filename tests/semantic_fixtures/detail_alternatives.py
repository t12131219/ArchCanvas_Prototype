"""Unfamiliar compositions for independently bounded detail views; static only."""
import torch
from torch import nn


def long_path(x):
    x = torch.sin(x)
    x = torch.cos(x)
    x = torch.tanh(x)
    x = torch.sigmoid(x)
    x = torch.sin(x)
    x = torch.cos(x)
    x = torch.tanh(x)
    x = torch.sigmoid(x)
    x = torch.sin(x)
    x = torch.cos(x)
    x = torch.tanh(x)
    x = torch.sigmoid(x)
    return x


class NestedWorkshop(nn.Module):
    def assembly(self, x, signal):
        weight = torch.sigmoid(long_path(x))
        gate = weight * torch.tanh(signal)
        shared = torch.sin(gate)
        woven = torch.cos(shared) - torch.tanh(shared)
        scores, indices = torch.topk(woven, 2)
        unknown = unfamiliar_bridge(scores, indices)
        return unknown + gate

    def forward(self, x, signal):
        return torch.relu(self.assembly(x, signal))


class BrokenWorkshop(nn.Module):
    def assembly(self, x, signal):
        weight = unfinished_weight(long_path(x))
        gate = weight * torch.tanh(signal)
        shared = torch.sin(gate)
        woven = torch.cos(shared) - torch.tanh(shared)
        scores, indices = torch.topk(woven, 2)
        unknown = unfamiliar_bridge(scores, indices)
        return unknown + gate

    def forward(self, x, signal):
        return torch.relu(self.assembly(x, signal))


class ConditionalWorkshop(nn.Module):
    def assembly(self, x, signal, flag):
        if flag:
            weight = torch.sigmoid(long_path(x))
            gate = weight * torch.tanh(signal)
        else:
            gate = unfamiliar_bridge(x, signal)
        return torch.cos(gate)

    def forward(self, x, signal, flag):
        return torch.relu(self.assembly(x, signal, flag))
